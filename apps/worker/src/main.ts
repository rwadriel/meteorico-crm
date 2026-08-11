import { getClient, disconnect } from '@meteorico/database';
import { createWorkerLogger } from './logger.js';
import { createProvider } from './adapters/whatsapp-manager.js';
import { processEventBatch } from './processors/group-events.js';
import { reconcileSnapshots } from './processors/snapshot-reconciliation.js';
import { startHealthServer } from './health.js';
import {
  startOutboundMessageWorker,
  startIntegrationTaskWorker,
  closeRedisConnection,
} from './queues/index.js';

const logger = createWorkerLogger();

const POLLING_INTERVAL_MS = parseInt(
  process.env.WORKER_POLLING_INTERVAL_MS ?? '10000',
  10,
);
const RECONCILIATION_INTERVAL_MS = parseInt(
  process.env.WORKER_RECONCILIATION_INTERVAL_MS ?? '3600000',
  10,
);

async function pollEvents(): Promise<void> {
  const provider = createProvider();
  if (!provider) return;

  const db = getClient();

  const cursorRecord = await db.integrationCursor.findUnique({
    where: { integration: 'whatsapp-manager' },
  });

  if (!cursorRecord) {
    const health = await provider.health();
    await db.integrationCursor.create({
      data: {
        integration: 'whatsapp-manager',
        cursor: String(health.lastSeq),
        lastPolledAt: new Date(),
      },
    });
    logger.info(
      { lastSeq: health.lastSeq },
      'WhatsApp Manager cursor initialized at latest event',
    );
    return;
  }

  let since = parseInt(cursorRecord.cursor, 10);
  let totalProcessed = 0;

  let hasMore = true;
  while (hasMore) {
    const response = await provider.events(since);

    if (response.events.length === 0) break;

    const result = await processEventBatch(db, response.events);
    totalProcessed += result.processed;

    if (result.failed > 0) {
      logger.warn({ failed: result.failed }, 'Some events failed processing');
    }
    if (result.deadLettered > 0) {
      logger.warn({ deadLettered: result.deadLettered }, 'Events dead-lettered');
    }

    since = response.nextSince;
    hasMore = response.hasMore;

    await db.integrationCursor.upsert({
      where: { integration: 'whatsapp-manager' },
      create: {
        integration: 'whatsapp-manager',
        cursor: String(since),
        lastPolledAt: new Date(),
      },
      update: {
        cursor: String(since),
        lastPolledAt: new Date(),
      },
    });
  }

  if (totalProcessed > 0) {
    logger.info({ totalProcessed }, 'Polling cycle complete');
  }
}

async function runReconciliation(): Promise<void> {
  const provider = createProvider();
  if (!provider) return;

  const db = getClient();

  try {
    const result = await reconcileSnapshots(db, provider);
    if (result.groupsReconciled > 0) {
      logger.info(result, 'Reconciliation cycle complete');
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error({ error: message }, 'Reconciliation failed');
  }
}

async function start(): Promise<void> {
  logger.info('Meteorico CRM Worker starting...');

  logger.info({
    pollingInterval: POLLING_INTERVAL_MS,
    reconciliationInterval: RECONCILIATION_INTERVAL_MS,
    nodeEnv: process.env.NODE_ENV ?? 'development',
  }, 'Worker configuration loaded');

  startHealthServer();

  const outboundWorker = process.env.WHATSAPP_OUTBOUND_ENABLED === 'true'
    ? startOutboundMessageWorker()
    : null;
  if (!outboundWorker) {
    logger.warn('Outbound message worker disabled by WHATSAPP_OUTBOUND_ENABLED');
  }
  const integrationWorker = startIntegrationTaskWorker();

  const pollingTimer = setInterval(async () => {
    try {
      await pollEvents();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      logger.error({ error: message }, 'Polling cycle failed');
    }
  }, POLLING_INTERVAL_MS);

  const reconciliationTimer = setInterval(async () => {
    try {
      await runReconciliation();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      logger.error({ error: message }, 'Reconciliation cycle failed');
    }
  }, RECONCILIATION_INTERVAL_MS);

  try {
    await pollEvents();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.error({ error: message }, 'Initial polling failed');
  }

  logger.info('Worker ready');

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Worker shutting down');
    clearInterval(pollingTimer);
    clearInterval(reconciliationTimer);
    await outboundWorker?.close();
    await integrationWorker.close();
    await closeRedisConnection();
    await disconnect();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start().catch((err) => {
  logger.fatal(err, 'Worker failed to start');
  process.exit(1);
});
