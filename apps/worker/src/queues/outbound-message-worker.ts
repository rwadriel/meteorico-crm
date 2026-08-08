import { Worker, type Job } from 'bullmq';
import { getClient } from '@meteorico/database';
import { getRedisConnection } from './connection.js';
import { createWorkerLogger } from '../logger.js';

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

  if (existingRecord && existingRecord.status === 'sent') {
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

  const message = await db.conversationMessage.create({
    data: {
      conversationId,
      direction: 'outbound',
      content,
      messageType,
      templateId: job.data.templateId ?? null,
      provider: 'queue',
      deliveryStatus: 'queued',
      sentAt: new Date(),
    },
  });

  await db.outboundRecord.update({
    where: { idempotencyKey },
    data: {
      status: 'sent',
      sentAt: new Date(),
      providerMessageId: message.id,
      contactId: conversation.contactId,
    },
  });

  logger.info({ conversationId, idempotencyKey }, 'Message sent');
}

export function startOutboundMessageWorker(): Worker<OutboundMessageJob> {
  const worker = new Worker<OutboundMessageJob>(
    QUEUE_NAME,
    processOutboundMessage,
    {
      connection: getRedisConnection(),
      concurrency: 5,
      limiter: { max: 30, duration: 1000 },
    },
  );

  worker.on('completed', (job) => {
    logger.debug({ jobId: job.id }, 'Outbound message processed');
  });

  worker.on('failed', (job, err) => {
    if (job) {
      const db = getClient();
      db.outboundRecord.update({
        where: { idempotencyKey: job.data.idempotencyKey },
        data: { status: 'failed', lastError: err.message },
      }).catch((e) => logger.error({ err: e }, 'Failed to update outbound record on failure'));
    }
    logger.error(
      { jobId: job?.id, error: err.message, attempts: job?.attemptsMade },
      'Outbound message failed',
    );
  });

  logger.info('Outbound message worker started');
  return worker;
}
