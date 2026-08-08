import { Queue } from 'bullmq';
import { getRedisConnection } from './connection.js';

export const OUTBOUND_MESSAGE_QUEUE = 'outbound-messages';

export interface OutboundMessageJob {
  conversationId: string;
  content: string;
  messageType: string;
  templateId?: string;
  idempotencyKey: string;
}

let queue: Queue<OutboundMessageJob> | null = null;

export function getOutboundMessageQueue(): Queue<OutboundMessageJob> {
  if (!queue) {
    queue = new Queue<OutboundMessageJob>(OUTBOUND_MESSAGE_QUEUE, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 5000 },
      },
    });
  }
  return queue;
}

export async function enqueueOutboundMessage(
  job: OutboundMessageJob,
): Promise<string> {
  const q = getOutboundMessageQueue();
  const added = await q.add(job.idempotencyKey, job, {
    jobId: job.idempotencyKey,
  });
  return added.id ?? job.idempotencyKey;
}
