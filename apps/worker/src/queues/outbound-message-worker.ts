import { Worker, type Job } from 'bullmq';
import { getClient } from '@meteorico/database';
import { OutboundBlockedError, type MessagePayload } from '@meteorico/shared';
import { getRedisConnection } from './connection.js';
import { createWorkerLogger } from '../logger.js';
import { createOutboundMessagingProvider } from '../adapters/meta-cloud-whatsapp.js';

const QUEUE_NAME = 'outbound-messages';
const logger = createWorkerLogger();

interface OutboundMessageJob {
  conversationId: string;
  contactId?: string;
  campaignId?: string;
  content: string;
  messageType: string;
  templateId?: string;
  idempotencyKey: string;
}

async function processOutboundMessage(job: Job<OutboundMessageJob>): Promise<void> {
  const db = getClient();
  const { conversationId, idempotencyKey, content, messageType, contactId, campaignId } = job.data;

  const existingRecord = await db.outboundRecord.findUnique({
    where: { idempotencyKey },
  });

  if (existingRecord && ['sent', 'delivered', 'read'].includes(existingRecord.status)) {
    logger.info({ idempotencyKey }, 'Duplicate message skipped (already sent)');
    return;
  }

  if (!existingRecord) {
    await db.outboundRecord.create({
      data: {
        idempotencyKey,
        contactId: contactId ?? null,
        campaignId: campaignId ?? null,
        conversationId,
        provider: 'queue',
        status: 'pending',
        attempts: 0,
      },
    });
  }

  await db.outboundRecord.update({
    where: { idempotencyKey },
    data: { attempts: { increment: 1 } },
  });

  const conversation = await db.conversation.findUnique({
    where: { id: conversationId },
    include: { contact: true },
  });

  if (!conversation) {
    await db.outboundRecord.update({
      where: { idempotencyKey },
      data: { status: 'failed', lastError: `Conversation ${conversationId} not found` },
    });
    throw new Error(`Conversation ${conversationId} not found`);
  }

  const optOut = await db.contactPreference.findFirst({
    where: {
      contactId: conversation.contactId,
      channel: 'whatsapp',
      optedOut: true,
    },
  });

  if (optOut) {
    logger.warn({ contactId: conversation.contactId }, 'Contact opted out, skipping');
    await db.outboundRecord.update({
      where: { idempotencyKey },
      data: { status: 'skipped', lastError: 'opted_out' },
    });
    return;
  }

  if (conversation.status === 'handoff') {
    logger.warn({ conversationId }, 'Human handoff active, outbound skipped');
    await db.outboundRecord.update({
      where: { idempotencyKey },
      data: { status: 'skipped', lastError: 'human_handoff' },
    });
    return;
  }

  const provider = createOutboundMessagingProvider();
  const normalizedMessageType: MessagePayload['messageType'] =
    messageType === 'link' || messageType === 'interactive' ? messageType : 'text';

  let externalMessageId: string;
  try {
    const result = await provider.sendMessage({
      to: conversation.contact.normalizedPhone ?? conversation.contact.phone ?? '',
      content,
      messageType: normalizedMessageType,
    });
    externalMessageId = result.externalMessageId;
  } catch (error) {
    if (error instanceof OutboundBlockedError) {
      await db.outboundRecord.update({
        where: { idempotencyKey },
        data: { status: 'blocked', lastError: error.code, provider: provider.name },
      });
      logger.warn({ conversationId, idempotencyKey }, 'Staging allowlist blocked outbound');
      return;
    }
    throw error;
  }

  await db.conversationMessage.create({
    data: {
      conversationId,
      direction: 'outbound',
      content,
      messageType: normalizedMessageType,
      templateId: job.data.templateId ?? null,
      externalMessageId,
      provider: provider.name,
      deliveryStatus: 'sent',
      sentAt: new Date(),
    },
  });

  await db.outboundRecord.update({
    where: { idempotencyKey },
    data: {
      status: 'sent',
      sentAt: new Date(),
      provider: provider.name,
      providerMessageId: externalMessageId,
      contactId: conversation.contactId,
    },
  });

  await db.auditLog.create({
    data: {
      action: 'outbound.sent',
      resource: 'outbound_records',
      resourceId: existingRecord?.id ?? idempotencyKey,
      newValue: {
        campaignId: campaignId ?? null,
        contactId: conversation.contactId,
        provider: provider.name,
      },
    },
  });

  logger.info({ conversationId, idempotencyKey }, 'Message sent');
}

export function startOutboundMessageWorker(): Worker<OutboundMessageJob> {
  const worker = new Worker<OutboundMessageJob>(QUEUE_NAME, processOutboundMessage, {
    connection: getRedisConnection(),
    concurrency: 5,
    limiter: { max: 30, duration: 1000 },
  });

  worker.on('completed', (job) => {
    logger.debug({ jobId: job.id }, 'Outbound message processed');
  });

  worker.on('failed', (job, err) => {
    if (job) {
      const db = getClient();
      db.outboundRecord
        .update({
          where: { idempotencyKey: job.data.idempotencyKey },
          data: { status: 'failed', lastError: err.message },
        })
        .catch((e) => logger.error({ err: e }, 'Failed to update outbound record on failure'));
    }
    logger.error(
      { jobId: job?.id, error: err.message, attempts: job?.attemptsMade },
      'Outbound message failed',
    );
  });

  logger.info('Outbound message worker started');
  return worker;
}
