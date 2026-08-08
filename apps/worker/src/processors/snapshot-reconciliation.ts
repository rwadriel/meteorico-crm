import type { PrismaClient } from '@meteorico/database';
import type { WhatsAppManagerProvider, WmSnapshotGroup } from '../adapters/whatsapp-manager.js';
import { createWorkerLogger } from '../logger.js';

const logger = createWorkerLogger();

export interface ReconciliationResult {
  groupsReconciled: number;
  membershipsAdded: number;
  membershipsRemoved: number;
  contactsCreated: number;
  skippedUnknown: number;
}

export async function reconcileSnapshots(
  db: PrismaClient,
  provider: WhatsAppManagerProvider,
  groupId?: string,
): Promise<ReconciliationResult> {
  const result: ReconciliationResult = {
    groupsReconciled: 0,
    membershipsAdded: 0,
    membershipsRemoved: 0,
    contactsCreated: 0,
    skippedUnknown: 0,
  };

  const { groups: snapshots } = await provider.snapshots(groupId);

  for (const snapshot of snapshots) {
    const group = await db.group.findFirst({
      where: { whatsappId: snapshot.groupId },
    });

    if (!group) {
      result.skippedUnknown++;
      continue;
    }

    await reconcileGroup(db, group, snapshot, result);
    result.groupsReconciled++;
  }

  logger.info(result, 'Snapshot reconciliation complete');
  return result;
}

async function reconcileGroup(
  db: PrismaClient,
  group: { id: string; campaignId: string },
  snapshot: WmSnapshotGroup,
  result: ReconciliationResult,
) {
  if (!snapshot.members || snapshot.members.length === 0) return;

  const snapshotPhones = new Set<string>();
  for (const member of snapshot.members) {
    if (member.number) snapshotPhones.add(member.number);
  }

  const activeMemberships = await db.groupMembership.findMany({
    where: { groupId: group.id, isActive: true },
    include: { contact: true },
  });

  const activePhones = new Map<string, string>();
  for (const m of activeMemberships) {
    if (m.contact.phone) {
      activePhones.set(m.contact.phone, m.id);
    }
  }

  for (const member of snapshot.members) {
    if (!member.number) continue;
    if (activePhones.has(member.number)) continue;

    let contact = await db.contact.findUnique({ where: { phone: member.number } });
    if (!contact) {
      contact = await db.contact.create({
        data: {
          phone: member.number,
          normalizedPhone: member.number,
          name: member.name || '',
          firstSeenAt: new Date(),
          lastSeenAt: new Date(),
        },
      });
      result.contactsCreated++;
    }

    await db.groupMembership.create({
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
      await db.campaignParticipation.create({
        data: {
          contactId: contact.id,
          campaignId: group.campaignId,
          groupId: group.id,
          status: 'active',
          classification: 'new',
        },
      });

      await db.contact.update({
        where: { id: contact.id },
        data: { totalParticipations: { increment: 1 } },
      });
    } else if (existingParticipation.status === 'left') {
      await db.campaignParticipation.update({
        where: { id: existingParticipation.id },
        data: { status: 'active', groupId: group.id },
      });
    }

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
