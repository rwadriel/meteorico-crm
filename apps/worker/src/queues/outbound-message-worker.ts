import { Worker, type Job } from 'bullmq';
import { getClient } from '@meteorico/database';
import { getRedisConnection } from './connection.js';
import { createWorkerLogger } from '../logger.js';

const QUEUE_NAME = 'outbound-messages';
const logger = createWorkerLogger();

interface OutboundMessageJob {
  conversationId: string;
  content: string;
  messageType: string;
  templateId?: string;
  idempotencyKey: string;
}

async function processOutboundMessage(job: Job<OutboundMessageJob>): Promise<void> {
  const db = getClient();
  const { conversationId, idempotencyKey, content, messageType } = job.data;

  const existing = await db.processedEvent.findUnique({
    where: {
      eventSource_externalEventId: {
        eventSource: 'outbound-message',
        externalEventId: idempotencyKey,
      },
    },
  });

  if (existing) {
    logger.info({ idempotencyKey }, 'Duplicate message skipped');
    return;
  }

  const conversation = await db.conversation.findUnique({
    where: { id: conversationId },
    include: { contact: true },
  });

  if (!conversation) {
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
    await db.processedEvent.create({
      data: {
        eventSource: 'outbound-message',
        externalEventId: idempotencyKey,
        eventType: 'message_skipped',
        result: 'opted_out',
      },
    });
    return;
  }

  await db.conversationMessage.create({
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

  await db.processedEvent.create({
    data: {
      eventSource: 'outbound-message',
      externalEventId: idempotencyKey,
      eventType: 'message_sent',
      result: 'queued',
    },
  });

  logger.info({ conversationId, idempotencyKey }, 'Message queued for delivery');
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
    logger.error(
      { jobId: job?.id, error: err.message, attempts: job?.attemptsMade },
      'Outbound message failed',
    );
  });

  logger.info('Outbound message worker started');
  return worker;
}
