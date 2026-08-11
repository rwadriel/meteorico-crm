import type { PrismaClient } from '@meteorico/database';
import { Prisma } from '@meteorico/database';
import type { WmEvent, WmParticipant } from '../adapters/whatsapp-manager.js';
import { createWorkerLogger } from '../logger.js';
import { normalizeAllowedManagerPhone } from '../participant-safety.js';

const logger = createWorkerLogger();

const ENTER_EVENTS = new Set(['entrou', 'adicionado']);
const LEAVE_EVENTS = new Set(['saiu', 'removido']);

export interface ProcessResult {
  processed: number;
  skipped: number;
  failed: number;
  deadLettered: number;
}

export async function processEvent(
  db: PrismaClient,
  event: WmEvent,
): Promise<{ success: boolean; error?: string }> {
  const alreadyProcessed = await db.processedEvent.findUnique({
    where: {
      eventSource_externalEventId: {
        eventSource: 'whatsapp-manager',
        externalEventId: event.event_id,
      },
    },
  });

  if (alreadyProcessed) {
    return { success: true };
  }

  const group = await db.group.findFirst({
    where: { whatsappId: event.groupId },
    include: { campaign: true },
  });

  if (!group) {
    await db.processedEvent.create({
      data: {
        eventSource: 'whatsapp-manager',
        externalEventId: event.event_id,
        eventType: event.event,
        result: 'dead-letter:unknown-group',
      },
    });
    return { success: true };
  }

  if (!ENTER_EVENTS.has(event.event) && !LEAVE_EVENTS.has(event.event)) {
    await db.processedEvent.create({
      data: {
        eventSource: 'whatsapp-manager',
        externalEventId: event.event_id,
        eventType: event.event,
        result: 'skipped:non-membership-event',
      },
    });
    return { success: true };
  }

  const isEnter = ENTER_EVENTS.has(event.event);
  const occurredAt = new Date(event.ts);
  let participantsProcessed = 0;

  await db.$transaction(async (tx) => {
    for (let i = 0; i < event.participants.length; i++) {
      const participant = event.participants[i];
      const phone = normalizeAllowedManagerPhone(participant.number);
      if (!phone) continue;

      const contact = await upsertContact(tx as unknown as PrismaClient, participant, phone);

      if (isEnter) {
        await handleEnter(tx as unknown as PrismaClient, contact.id, group, occurredAt);
      } else {
        await handleLeave(tx as unknown as PrismaClient, contact.id, group, occurredAt);
      }

      const eventSuffix = event.participants.length > 1 ? `:${i}` : '';
      await (tx as unknown as PrismaClient).groupEvent.create({
        data: {
          groupId: group.id,
          contactId: contact.id,
          eventType: event.event,
          whatsappEventId: `${event.event_id}${eventSuffix}`,
          rawPayload: {
            ...event,
            participants: [participant],
          } as unknown as Prisma.InputJsonValue,
          occurredAt,
          processedAt: new Date(),
        },
      });

      participantsProcessed++;
    }

    await (tx as unknown as PrismaClient).processedEvent.create({
      data: {
        eventSource: 'whatsapp-manager',
        externalEventId: event.event_id,
        eventType: event.event,
        result: `processed:${participantsProcessed}-participants`,
      },
    });
  });

  return { success: true };
}

async function upsertContact(
  db: PrismaClient,
  participant: WmParticipant,
  phone: string,
) {
  const existing = await db.contact.findFirst({
    where: { OR: [{ phone }, { normalizedPhone: phone }] },
  });

  if (existing) {
    const updateData: Record<string, unknown> = { lastSeenAt: new Date() };
    if (participant.name && !existing.name) {
      updateData.name = participant.name;
    }
    return db.contact.update({
      where: { id: existing.id },
      data: updateData,
    });
  }

  return db.contact.create({
    data: {
      phone,
      normalizedPhone: phone,
      name: participant.name || '',
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
    },
  });
}

async function handleEnter(
  db: PrismaClient,
  contactId: string,
  group: { id: string; campaignId: string; category: string },
  occurredAt: Date,
) {
  const existingMembership = await db.groupMembership.findFirst({
    where: { groupId: group.id, contactId, isActive: true },
  });

  if (existingMembership) return;

  const membership = await db.groupMembership.create({
    data: {
      groupId: group.id,
      contactId,
      joinedAt: occurredAt,
      isActive: true,
    },
  });

  await db.group.update({
    where: { id: group.id },
    data: { currentCount: { increment: 1 } },
  });

  const existingParticipation = await db.campaignParticipation.findUnique({
    where: {
      contactId_campaignId: {
        contactId,
        campaignId: group.campaignId,
      },
    },
  });

  if (existingParticipation) {
    const existingMetadata = jsonObject(existingParticipation.metadata);
    if (existingParticipation.status === 'left') {
      await db.campaignParticipation.update({
        where: { id: existingParticipation.id },
        data: {
          status: 'active',
          groupId: group.id,
          metadata: {
            ...existingMetadata,
            reenteredAt: occurredAt.toISOString(),
            confirmationSource: 'whatsapp-manager',
          } as Prisma.InputJsonValue,
        },
      });
    } else if (!existingParticipation.groupId) {
      await db.campaignParticipation.update({
        where: { id: existingParticipation.id },
        data: {
          groupId: group.id,
          metadata: {
            ...existingMetadata,
            joinConfirmedAt: existingMetadata.joinConfirmedAt ?? occurredAt.toISOString(),
            confirmationSource: 'whatsapp-manager',
          } as Prisma.InputJsonValue,
        },
      });
    }
  } else {
    const participation = await db.campaignParticipation.create({
      data: {
        contactId,
        campaignId: group.campaignId,
        groupId: group.id,
        status: 'active',
        classification: classificationFromCategory(group.category),
        metadata: {
          joinConfirmedAt: occurredAt.toISOString(),
          confirmationSource: 'whatsapp-manager',
        } as Prisma.InputJsonValue,
      },
    });

    await db.contact.update({
      where: { id: contactId },
      data: { totalParticipations: { increment: 1 } },
    });

    await db.auditLog.create({
      data: {
        action: 'participation.confirmed',
        resource: 'campaign_participations',
        resourceId: participation.id,
        newValue: {
          contactId,
          campaignId: group.campaignId,
          groupId: group.id,
        } as Prisma.InputJsonValue,
      },
    });
  }

  await db.auditLog.create({
    data: {
      action: existingParticipation?.status === 'left' ? 'group.rejoin' : 'group.join',
      resource: 'group_memberships',
      resourceId: membership.id,
      newValue: {
        contactId,
        campaignId: group.campaignId,
        groupId: group.id,
      } as Prisma.InputJsonValue,
    },
  });
}

async function handleLeave(
  db: PrismaClient,
  contactId: string,
  group: { id: string; campaignId: string },
  occurredAt: Date,
) {
  const membership = await db.groupMembership.findFirst({
    where: { groupId: group.id, contactId, isActive: true },
  });

  if (membership) {
    await db.groupMembership.update({
      where: { id: membership.id },
      data: { isActive: false, leftAt: occurredAt },
    });

    await db.group.update({
      where: { id: group.id },
      data: { currentCount: { decrement: 1 } },
    });

    await db.auditLog.create({
      data: {
        action: 'group.leave',
        resource: 'group_memberships',
        resourceId: membership.id,
        newValue: {
          contactId,
          campaignId: group.campaignId,
          groupId: group.id,
        } as Prisma.InputJsonValue,
      },
    });
  }

  const participation = await db.campaignParticipation.findUnique({
    where: {
      contactId_campaignId: {
        contactId,
        campaignId: group.campaignId,
      },
    },
  });

  if (participation && participation.status === 'active') {
    await db.campaignParticipation.update({
      where: { id: participation.id },
      data: { status: 'left' },
    });
  }
}

function classificationFromCategory(category: string): string {
  return ['novo', 'reparticipante', 'veterano'].includes(category) ? category : 'new';
}

function jsonObject(value: Prisma.JsonValue | null): Record<string, Prisma.JsonValue> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, Prisma.JsonValue>)
    : {};
}

export async function processEventBatch(
  db: PrismaClient,
  events: WmEvent[],
): Promise<ProcessResult> {
  const result: ProcessResult = { processed: 0, skipped: 0, failed: 0, deadLettered: 0 };

  for (const event of events) {
    try {
      const r = await processEvent(db, event);
      if (r.success) {
        result.processed++;
      } else {
        result.failed++;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      logger.error({ eventId: event.event_id, error: message }, 'Failed to process event');

      try {
        await db.processedEvent.upsert({
          where: {
            eventSource_externalEventId: {
              eventSource: 'whatsapp-manager',
              externalEventId: event.event_id,
            },
          },
          create: {
            eventSource: 'whatsapp-manager',
            externalEventId: event.event_id,
            eventType: event.event,
            result: `dead-letter:${message.slice(0, 200)}`,
          },
          update: {
            result: `dead-letter:${message.slice(0, 200)}`,
          },
        });
        result.deadLettered++;
      } catch {
        result.failed++;
      }
    }
  }

  return result;
}
