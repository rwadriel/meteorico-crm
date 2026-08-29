import { getClient, disconnect } from '@meteorico/database';
import { assertRuntimeConfig } from '@meteorico/shared';
import { createWorkerLogger } from './logger.js';
import { createProvider } from './adapters/whatsapp-manager.js';
import { processEventBatch } from './processors/group-events.js';
import { reconcileSnapshots } from './processors/snapshot-reconciliation.js';
import { startHealthServer } from './health.js';
import {
  establishProviderBaseline,
  markProviderBaselineRequired,
  recordProviderFailure,
  recordSnapshotObservation,
  recordSuccessfulPoll,
  sanitizeProviderError,
} from './integration-health.js';
import {
  GROUP_MANAGER_INTEGRATION,
  assertProviderSourceId,
  providerIntegrationKey,
  requiresProviderBaseline,
} from './source-aware-cursor.js';
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
let pollingInProgress = false;
let reconciliationInProgress = false;

async function pollEvents(): Promise<void> {
  const provider = createProvider();
  if (!provider) return;

  const db = getClient();
  let integration = GROUP_MANAGER_INTEGRATION;
  try {
    const providerHealth = await provider.health();
    const sourceId = assertProviderSourceId(providerHealth.sourceId);
    integration = providerIntegrationKey(sourceId);
    if (!providerHealth.ok || providerHealth.connected === false) {
      throw new Error(providerHealth.connected === false
        ? 'WhatsApp Manager: provider disconnected'
        : 'WhatsApp Manager: provider unhealthy');
    }

    const cursorRecord = await db.integrationCursor.findUnique({
      where: { integration },
    });

    if (requiresProviderBaseline(cursorRecord)) {
      await markProviderBaselineRequired(db, {
        sourceId,
        providerLastSeq: providerHealth.lastSeq,
        providerConnected: providerHealth.connected,
      });
      logger.warn({
        event: 'integration_baseline_required',
        source: integration,
      }, 'Incremental polling blocked until a fresh snapshot establishes the baseline');
      return;
    }

    const activeCursor = cursorRecord!;
    let since = parseInt(activeCursor.cursor, 10);
    let totalProcessed = 0;
    let hasMore = true;

    while (hasMore) {
      const response = await provider.events(since);
      if (assertProviderSourceId(response.sourceId) !== sourceId) {
        throw new Error('WhatsApp Manager: source identity changed during event polling');
      }

      if (response.events.length > 0) {
        const result = await processEventBatch(db, response.events, integration);
        totalProcessed += result.processed;

        if (result.failed > 0) {
          logger.warn({ failed: result.failed }, 'Some events failed processing');
        }
        if (result.deadLettered > 0) {
          logger.warn({ deadLettered: result.deadLettered }, 'Events dead-lettered');
        }

        since = response.nextSince;
      }

      const transition = await recordSuccessfulPoll(db, {
        integration,
        cursor: since,
        providerLastSeq: response.lastSeq,
        providerConnected: providerHealth.connected,
      });
      if (transition.recovered) {
        logger.info({ event: 'integration_health_transition', status: 'recovered' },
          'Group Manager provider recovered');
      }

      if (response.events.length === 0) break;
      hasMore = response.hasMore;
    }

    logger.info({
      event: 'poll_success',
      totalProcessed,
      cursor: since,
      providerLastSeq: providerHealth.lastSeq,
    }, 'Polling cycle complete');
  } catch (error) {
    const message = await recordProviderFailure(
      db,
      error,
      {
        integration,
        scope: 'poll',
        ...(error instanceof Error && error.message.includes('provider disconnected')
          ? { providerConnected: false }
          : {}),
      },
    );
    logger.warn({
      event: 'integration_health_transition',
      status: message.includes('provider disconnected') ? 'disconnected' : 'degraded',
    }, 'Group Manager integration health changed');
    logger.error({ event: 'provider_error', error: message }, 'Polling cycle failed');
    throw error;
  }
}

async function runReconciliation(): Promise<void> {
  const provider = createProvider();
  if (!provider) return;

  const db = getClient();
  let integration = GROUP_MANAGER_INTEGRATION;

  try {
    const preflight = await provider.health();
    const sourceId = assertProviderSourceId(preflight.sourceId);
    integration = providerIntegrationKey(sourceId);
    const result = await reconcileSnapshots(db, provider);
    const snapshotReconciled = result.groupsReconciled > 0
      && result.skippedStale === 0
      && result.skippedIncomplete === 0
      && result.skippedDisconnected === 0;
    const providerSnapshotAt = result.oldestSnapshotAt
      ? new Date(result.oldestSnapshotAt)
      : null;
    const cursorRecord = await db.integrationCursor.findUnique({ where: { integration } });
    let transition: { recovered: boolean } = { recovered: false };

    if (snapshotReconciled && providerSnapshotAt && requiresProviderBaseline(cursorRecord)) {
      const baselineHealth = await provider.health();
      if (assertProviderSourceId(baselineHealth.sourceId) !== sourceId) {
        throw new Error('WhatsApp Manager: source identity changed before baseline');
      }
      await establishProviderBaseline(db, {
        sourceId,
        cursor: baselineHealth.lastSeq,
        providerSnapshotAt,
        providerConnected: baselineHealth.connected,
      });
      logger.info({
        event: 'integration_baseline_established',
        source: integration,
        cursor: baselineHealth.lastSeq,
      }, 'Fresh snapshot established a source-aware incremental baseline');
      transition = { recovered: true };
    } else {
      transition = await recordSnapshotObservation(db, {
        integration,
        providerSnapshotAt,
        ...(snapshotReconciled ? { successfulAt: new Date() } : {}),
        ...(result.providerConnected === null
          ? {}
          : { providerConnected: result.providerConnected }),
      });
    }
    if (transition.recovered) {
      logger.info({
        event: 'integration_health_transition',
        status: 'recovered',
        source: 'snapshot',
      }, 'Group Manager snapshot channel recovered');
    }
    logger.info({ event: 'reconciliation_success', ...result },
      'Reconciliation cycle complete');
  } catch (err) {
    const message = await recordProviderFailure(db, err, { integration, scope: 'snapshot' });
    logger.error({ event: 'provider_error', error: message }, 'Reconciliation failed');
  }
}

async function runPollingCycle(): Promise<void> {
  if (pollingInProgress) {
    logger.warn({ event: 'poll_skipped', reason: 'cycle_in_progress' },
      'Overlapping polling cycle skipped');
    return;
  }

  pollingInProgress = true;
  try {
    await pollEvents();
  } catch (error) {
    logger.error({
      event: 'poll_cycle_unhandled',
      error: sanitizeProviderError(error),
    }, 'Polling cycle ended with an error');
  } finally {
    pollingInProgress = false;
  }
}

async function runReconciliationCycle(): Promise<void> {
  if (reconciliationInProgress) {
    logger.warn({ event: 'reconciliation_skipped', reason: 'cycle_in_progress' },
      'Overlapping reconciliation cycle skipped');
    return;
  }

  reconciliationInProgress = true;
  try {
    await runReconciliation();
  } catch (error) {
    logger.error({
      event: 'reconciliation_cycle_unhandled',
      error: sanitizeProviderError(error),
    }, 'Reconciliation cycle ended with an error');
  } finally {
    reconciliationInProgress = false;
  }
}

async function start(): Promise<void> {
  assertRuntimeConfig('worker');
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

  await runPollingCycle();
  await runReconciliationCycle();

  const pollingTimer = setInterval(() => {
    void runPollingCycle();
  }, POLLING_INTERVAL_MS);

  const reconciliationTimer = setInterval(() => {
    void runReconciliationCycle();
  }, RECONCILIATION_INTERVAL_MS);

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
