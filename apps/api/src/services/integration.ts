import type { PrismaClient } from '@meteorico/database';
import {
  calculateGroupManagerHealth,
  groupManagerSnapshotStaleAfterSeconds,
  type GroupManagerConnectionSource,
  type GroupManagerCursorStatus,
  type GroupManagerHealthStatus,
} from '@meteorico/shared';

export interface IntegrationHealthStatus {
  integration: string;
  sourceIdentity: string | null;
  baselineEstablished: boolean;
  status: GroupManagerHealthStatus;
  connected: boolean | null;
  connectionSource: GroupManagerConnectionSource;
  snapshotFresh: boolean;
  pollFresh: boolean;
  snapshotAgeSeconds: number | null;
  pollAgeSeconds: number | null;
  cursorStatus: GroupManagerCursorStatus;
  reasons: string[];
  lastPolledAt: string | null;
  lastSuccessfulPollAt: string | null;
  lastSuccessfulSnapshotAt: string | null;
  providerSnapshotAt: string | null;
  lastSuccessfulEventAt: string | null;
  lastCursorAdvanceAt: string | null;
  cursor: string | null;
  providerLastSeq: number | null;
  consecutiveFailures: number;
  lastProviderError: string | null;
  lastProviderErrorScope: string | null;
  lastEventProcessedAt: string | null;
  lastEventType: string | null;
  totalProcessed: number;
  totalDeadLettered: number;
  totalSkipped: number;
  recentErrors: Array<{
    eventId: string;
    eventType: string;
    result: string;
    processedAt: string;
  }>;
}

export async function getIntegrationHealth(
  db: PrismaClient,
  integration: string,
): Promise<IntegrationHealthStatus> {
  const cursor = await db.integrationCursor.findFirst({
    where: {
      OR: [
        { integration },
        { integration: { startsWith: `${integration}:` } },
      ],
    },
    orderBy: { updatedAt: 'desc' },
  });
  const activeEventSource = cursor?.integration ?? integration;
  const sourceAware = cursor?.integration.startsWith(`${integration}:`) ?? false;
  const baselineRequired = cursor?.lastProviderError === 'provider_source_baseline_required'
    || (sourceAware && (
      cursor?.lastPolledAt === null
      || cursor?.lastSuccessfulSnapshotAt === null
    ));

  const lastEvent = await db.processedEvent.findFirst({
    where: { eventSource: activeEventSource },
    orderBy: { processedAt: 'desc' },
  });

  const lastSuccessfulEvent = await db.processedEvent.findFirst({
    where: {
      eventSource: activeEventSource,
      result: { startsWith: 'processed:' },
    },
    orderBy: { processedAt: 'desc' },
  });

  const totalProcessed = await db.processedEvent.count({
    where: {
      eventSource: activeEventSource,
      result: { startsWith: 'processed:' },
    },
  });

  const totalDeadLettered = await db.processedEvent.count({
    where: {
      eventSource: activeEventSource,
      result: { startsWith: 'dead-letter:' },
    },
  });

  const totalSkipped = await db.processedEvent.count({
    where: {
      eventSource: activeEventSource,
      result: { startsWith: 'skipped:' },
    },
  });

  const recentErrors = await db.processedEvent.findMany({
    where: {
      eventSource: activeEventSource,
      result: { startsWith: 'dead-letter:' },
    },
    orderBy: { processedAt: 'desc' },
    take: 10,
    select: {
      externalEventId: true,
      eventType: true,
      result: true,
      processedAt: true,
    },
  });

  const pollingIntervalMs = positiveNumber(
    process.env.WORKER_POLLING_INTERVAL_MS,
    10000,
  );
  const model = calculateGroupManagerHealth({
    configured: cursor !== null
      || Boolean(process.env.WHATSAPP_MANAGER_URL
        && process.env.WHATSAPP_MANAGER_INTEGRATION_TOKEN),
    providerConnected: cursor?.providerConnected ?? null,
    lastSuccessfulPollAt: cursor?.lastPolledAt ?? null,
    snapshotEvidenceAt: cursor?.providerSnapshotAt ?? null,
    cursor: cursor?.cursor ?? null,
    providerLastSeq: cursor?.providerLastSeq ?? null,
    consecutiveFailures: cursor?.consecutiveFailures ?? 0,
    lastProviderError: cursor?.lastProviderError ?? null,
    baselineRequired,
    snapshotStaleAfterSeconds: groupManagerSnapshotStaleAfterSeconds(
      process.env.GROUP_MANAGER_SNAPSHOT_STALE_AFTER_SECONDS,
    ),
    pollStaleAfterSeconds: Math.max(60, Math.ceil(pollingIntervalMs * 6 / 1000)),
  });

  return {
    integration,
    sourceIdentity: sourceIdentityFromIntegration(cursor?.integration ?? null, integration),
    baselineEstablished: cursor !== null
      && cursor.lastPolledAt !== null
      && cursor.lastSuccessfulSnapshotAt !== null
      && !baselineRequired,
    status: model.status,
    connected: model.connected,
    connectionSource: model.connectionSource,
    snapshotFresh: model.snapshotFresh,
    pollFresh: model.pollFresh,
    snapshotAgeSeconds: model.snapshotAgeSeconds,
    pollAgeSeconds: model.pollAgeSeconds,
    cursorStatus: model.cursorStatus,
    reasons: model.reasons,
    lastPolledAt: cursor?.lastPolledAt?.toISOString() ?? null,
    lastSuccessfulPollAt: cursor?.lastPolledAt?.toISOString() ?? null,
    lastSuccessfulSnapshotAt: cursor?.lastSuccessfulSnapshotAt?.toISOString() ?? null,
    providerSnapshotAt: cursor?.providerSnapshotAt?.toISOString() ?? null,
    lastSuccessfulEventAt: lastSuccessfulEvent?.processedAt?.toISOString() ?? null,
    lastCursorAdvanceAt: cursor?.lastCursorAdvanceAt?.toISOString() ?? null,
    cursor: cursor?.cursor ?? null,
    providerLastSeq: cursor?.providerLastSeq ?? null,
    consecutiveFailures: cursor?.consecutiveFailures ?? 0,
    lastProviderError: safeErrorSummary(cursor?.lastProviderError ?? null),
    lastProviderErrorScope: cursor?.lastProviderErrorScope ?? null,
    lastEventProcessedAt: lastEvent?.processedAt?.toISOString() ?? null,
    lastEventType: lastEvent?.eventType ?? null,
    totalProcessed,
    totalDeadLettered,
    totalSkipped,
    recentErrors: recentErrors.map((e) => ({
      eventId: e.externalEventId,
      eventType: e.eventType,
      result: e.result,
      processedAt: e.processedAt.toISOString(),
    })),
  };
}

function sourceIdentityFromIntegration(
  cursorIntegration: string | null,
  baseIntegration: string,
): string | null {
  if (!cursorIntegration) return null;
  const prefix = `${baseIntegration}:`;
  return cursorIntegration.startsWith(prefix)
    ? cursorIntegration.slice(prefix.length)
    : null;
}

function positiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function safeErrorSummary(value: string | null): string | null {
  if (value === null) return null;
  return value
    .replace(/(authorization|token|secret|password)([=: ]+)[^\s&,;]+/gi, '$1$2[REDACTED]')
    .replace(/https?:\/\/[^\s]+/gi, '[provider-url]')
    .slice(0, 240);
}

export async function getOrphanGroups(db: PrismaClient) {
  const orphanCampaign = await db.campaign.findFirst({
    where: { slug: '_orphan-events' },
  });

  if (!orphanCampaign) return [];

  return db.group.findMany({
    where: { campaignId: orphanCampaign.id },
    orderBy: { createdAt: 'desc' },
  });
}

export async function assignOrphanGroup(
  db: PrismaClient,
  groupId: string,
  campaignId: string,
) {
  const group = await db.group.findUnique({ where: { id: groupId } });
  if (!group) throw new Error('Group not found');

  const campaign = await db.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new Error('Campaign not found');

  return db.group.update({
    where: { id: groupId },
    data: { campaignId, isActive: true },
  });
}
