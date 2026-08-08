import type { PrismaClient } from '@meteorico/database';

export interface IntegrationHealthStatus {
  integration: string;
  lastPolledAt: string | null;
  cursor: string | null;
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
  const cursor = await db.integrationCursor.findUnique({
    where: { integration },
  });

  const lastEvent = await db.processedEvent.findFirst({
    where: { eventSource: integration },
    orderBy: { processedAt: 'desc' },
  });

  const totalProcessed = await db.processedEvent.count({
    where: {
      eventSource: integration,
      result: { startsWith: 'processed:' },
    },
  });

  const totalDeadLettered = await db.processedEvent.count({
    where: {
      eventSource: integration,
      result: { startsWith: 'dead-letter:' },
    },
  });

  const totalSkipped = await db.processedEvent.count({
    where: {
      eventSource: integration,
      result: { startsWith: 'skipped:' },
    },
  });

  const recentErrors = await db.processedEvent.findMany({
    where: {
      eventSource: integration,
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

  return {
    integration,
    lastPolledAt: cursor?.lastPolledAt?.toISOString() ?? null,
    cursor: cursor?.cursor ?? null,
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
