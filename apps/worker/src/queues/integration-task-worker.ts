import { Worker, type Job } from 'bullmq';
import { getClient } from '@meteorico/database';
import { getRedisConnection } from './connection.js';
import { createWorkerLogger } from '../logger.js';

const QUEUE_NAME = 'integration-tasks';
const logger = createWorkerLogger();

interface IntegrationTaskJob {
  provider: string;
  action: string;
  payload: Record<string, unknown>;
  idempotencyKey: string;
}

async function processIntegrationTask(job: Job<IntegrationTaskJob>): Promise<void> {
  const db = getClient();
  const { provider, action, idempotencyKey } = job.data;

  const existing = await db.processedEvent.findUnique({
    where: {
      eventSource_externalEventId: {
        eventSource: `integration:${provider}`,
        externalEventId: idempotencyKey,
      },
    },
  });

  if (existing) {
    logger.info({ idempotencyKey, provider }, 'Duplicate integration task skipped');
    return;
  }

  await db.integrationLog.create({
    data: {
      provider,
      endpoint: action,
      method: 'QUEUE',
      requestBody: JSON.parse(JSON.stringify(job.data.payload)),
      statusCode: null,
      latencyMs: null,
    },
  });

  await db.processedEvent.create({
    data: {
      eventSource: `integration:${provider}`,
      externalEventId: idempotencyKey,
      eventType: action,
      result: 'processed',
    },
  });

  logger.info({ provider, action, idempotencyKey }, 'Integration task processed');
}

export function startIntegrationTaskWorker(): Worker<IntegrationTaskJob> {
  const worker = new Worker<IntegrationTaskJob>(
    QUEUE_NAME,
    processIntegrationTask,
    {
      connection: getRedisConnection(),
      concurrency: 3,
      limiter: { max: 10, duration: 1000 },
    },
  );

  worker.on('completed', (job) => {
    logger.debug({ jobId: job.id }, 'Integration task processed');
  });

  worker.on('failed', (job, err) => {
    logger.error(
      { jobId: job?.id, error: err.message, attempts: job?.attemptsMade },
      'Integration task failed',
    );
  });

  logger.info('Integration task worker started');
  return worker;
}
