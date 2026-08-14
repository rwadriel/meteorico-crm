import type { PrismaClient } from '@meteorico/database';
import { Prisma } from '@meteorico/database';
import { groupManagerSnapshotStaleAfterSeconds } from '@meteorico/shared';
import type { WhatsAppManagerProvider, WmSnapshotGroup } from '../adapters/whatsapp-manager.js';
import { createWorkerLogger } from '../logger.js';
import { normalizeAllowedManagerPhone } from '../participant-safety.js';

const logger = createWorkerLogger();

export interface ReconciliationResult {
  groupsReconciled: number;
  membershipsAdded: number;
  membershipsRemoved: number;
  contactsCreated: number;
  skippedUnknown: number;
  skippedStale: number;
  skippedDisconnected: number;
  skippedIncomplete: number;
  groupsSeen: number;
  oldestSnapshotAt: string | null;
  providerConnected: boolean | null;
}

export async function reconcileSnapshots(
  db: PrismaClient,
  provider: WhatsAppManagerProvider,
  groupId?: string,
  now = new Date(),
): Promise<ReconciliationResult> {
  const result: ReconciliationResult = {
    groupsReconciled: 0,
    membershipsAdded: 0,
    membershipsRemoved: 0,
    contactsCreated: 0,
    skippedUnknown: 0,
    skippedStale: 0,
    skippedDisconnected: 0,
    skippedIncomplete: 0,
    groupsSeen: 0,
    oldestSnapshotAt: null,
    providerConnected: null,
  };

  const health = await provider.health();
  result.providerConnected = health.connected ?? null;
  if (!health.ok || health.connected === false) {
    result.skippedDisconnected = 1;
    logger.warn({
      event: 'reconciliation_skipped',
      reason: health.connected === false ? 'provider_disconnected' : 'provider_unhealthy',
    }, 'Snapshot reconciliation skipped');
    return result;
  }

  const { groups: snapshots } = await provider.snapshots(groupId);
  result.groupsSeen = snapshots.length;
  const staleAfterSeconds = groupManagerSnapshotStaleAfterSeconds(
    process.env.GROUP_MANAGER_SNAPSHOT_STALE_AFTER_SECONDS,
  );
  let oldestObservedAt: Date | null = null;

  for (const snapshot of snapshots) {
    const group = await db.group.findFirst({
      where: { whatsappId: snapshot.groupId },
    });

    if (!group) {
      result.skippedUnknown++;
      continue;
    }

    const snapshotAt = parseSnapshotDate(snapshot.updatedAt);
    const timestampFromFuture = snapshotAt !== null
      && snapshotAt.getTime() > now.getTime() + 5 * 60 * 1000;
    if (snapshotAt !== null && !timestampFromFuture) {
      if (oldestObservedAt === null || snapshotAt < oldestObservedAt) {
        oldestObservedAt = snapshotAt;
      }
    }

    if (
      snapshotAt === null
      || timestampFromFuture
      || now.getTime() - snapshotAt.getTime() > staleAfterSeconds * 1000
    ) {
      result.skippedStale++;
      logger.warn({
        event: 'snapshot_stale',
        groupId: snapshot.groupId,
        snapshotAt: snapshotAt?.toISOString() ?? null,
        timestampFromFuture,
        staleAfterSeconds,
      }, 'Stale snapshot ignored');
      continue;
    }

    if (!snapshot.members) {
      result.skippedIncomplete++;
      logger.warn({
        event: 'reconciliation_skipped',
        groupId: snapshot.groupId,
        reason: 'members_missing',
      }, 'Incomplete snapshot ignored');
      continue;
    }

    await reconcileGroup(db, group, snapshot, result);
    result.groupsReconciled++;
  }

  if (result.skippedIncomplete === 0) {
    result.oldestSnapshotAt = oldestObservedAt?.toISOString() ?? null;
  }

  logger.info({ event: 'snapshot_success', ...result }, 'Snapshot reconciliation complete');
  return result;
}

async function reconcileGroup(
  db: PrismaClient,
  group: { id: string; campaignId: string; category: string },
  snapshot: WmSnapshotGroup,
  result: ReconciliationResult,
) {
  const snapshotPhones = new Set<string>();
  for (const member of snapshot.members ?? []) {
    const phone = normalizeAllowedManagerPhone(member.number);
    if (phone) snapshotPhones.add(phone);
  }

  const activeMemberships = await db.groupMembership.findMany({
    where: { groupId: group.id, isActive: true },
    include: { contact: true },
  });

  const activePhones = new Map<string, string>();
  for (const m of activeMemberships) {
    const phone = normalizeAllowedManagerPhone(m.contact.normalizedPhone ?? m.contact.phone);
    if (phone) {
      activePhones.set(phone, m.id);
    }
  }

  for (const member of snapshot.members ?? []) {
    const phone = normalizeAllowedManagerPhone(member.number);
    if (!phone) continue;
    if (activePhones.has(phone)) continue;

    let contact = await db.contact.findFirst({
      where: { OR: [{ phone }, { normalizedPhone: phone }] },
    });
    if (!contact) {
      contact = await db.contact.create({
        data: {
          phone,
          normalizedPhone: phone,
          name: member.name || '',
          firstSeenAt: new Date(),
          lastSeenAt: new Date(),
        },
      });
      result.contactsCreated++;
    }

    const membership = await db.groupMembership.create({
      data: {
        groupId: group.id,
        contactId: contact.id,
        joinedAt: new Date(),
        isActive: true,
      },
    });

    const existingParticipation = await db.campaignParticipation.findUnique({
      where: {
        contactId_campaignId: {
          contactId: contact.id,
          campaignId: group.campaignId,
        },
      },
    });

    if (!existingParticipation) {
      const participation = await db.campaignParticipation.create({
        data: {
          contactId: contact.id,
          campaignId: group.campaignId,
          groupId: group.id,
          status: 'active',
          classification: classificationFromCategory(group.category),
          metadata: {
            joinConfirmedAt: new Date().toISOString(),
            confirmationSource: 'whatsapp-manager-snapshot',
          } as Prisma.InputJsonValue,
        },
      });

      await db.contact.update({
        where: { id: contact.id },
        data: { totalParticipations: { increment: 1 } },
      });

      await db.auditLog.create({
        data: {
          action: 'participation.confirmed',
          resource: 'campaign_participations',
          resourceId: participation.id,
          newValue: {
            contactId: contact.id,
            campaignId: group.campaignId,
            groupId: group.id,
            source: 'snapshot',
          } as Prisma.InputJsonValue,
        },
      });
    } else if (existingParticipation.status === 'left') {
      await db.campaignParticipation.update({
        where: { id: existingParticipation.id },
        data: { status: 'active', groupId: group.id },
      });
    }

    await db.auditLog.create({
      data: {
        action: 'group.join',
        resource: 'group_memberships',
        resourceId: membership.id,
        newValue: {
          contactId: contact.id,
          campaignId: group.campaignId,
          groupId: group.id,
          source: 'snapshot',
        } as Prisma.InputJsonValue,
      },
    });

    result.membershipsAdded++;
  }

  for (const [phone, membershipId] of activePhones) {
    if (snapshotPhones.has(phone)) continue;

    await db.groupMembership.update({
      where: { id: membershipId },
      data: { isActive: false, leftAt: new Date() },
    });

    result.membershipsRemoved++;
  }

  await db.group.update({
    where: { id: group.id },
    data: { currentCount: snapshotPhones.size },
  });
}

function parseSnapshotDate(value: string): Date | null {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function classificationFromCategory(category: string): string {
  return ['novo', 'reparticipante', 'veterano'].includes(category) ? category : 'new';
}
