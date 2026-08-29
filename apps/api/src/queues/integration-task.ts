import { Queue } from 'bullmq';
import { getRedisConnection } from './connection.js';

export const INTEGRATION_TASK_QUEUE = 'integration-tasks';

export interface IntegrationTaskJob {
  provider: string;
  action: string;
  payload: Record<string, unknown>;
  idempotencyKey: string;
}

let queue: Queue<IntegrationTaskJob> | null = null;

export function getIntegrationTaskQueue(): Queue<IntegrationTaskJob> {
  if (!queue) {
    queue = new Queue<IntegrationTaskJob>(INTEGRATION_TASK_QUEUE, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        attempts: 8,
        backoff: { type: 'exponential', delay: 3000 },
        removeOnComplete: { count: 500 },
        removeOnFail: { count: 5000 },
      },
    });
  }
  return queue;
}

export async function enqueueIntegrationTask(
  job: IntegrationTaskJob,
): Promise<string> {
  const q = getIntegrationTaskQueue();
  const added = await q.add(job.action, job, {
    jobId: job.idempotencyKey,
  });
  return added.id ?? job.idempotencyKey;
}
