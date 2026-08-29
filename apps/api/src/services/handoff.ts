import type { PrismaClient } from '@meteorico/database';

export async function createHandoff(
  db: PrismaClient,
  data: { conversationId: string; assignedTo: string; reason: string },
) {
  await db.conversation.update({
    where: { id: data.conversationId },
    data: { assignedTo: data.assignedTo, status: 'handoff' },
  });

  return db.humanHandoff.create({
    data: {
      conversationId: data.conversationId,
      assignedTo: data.assignedTo,
      reason: data.reason,
      status: 'pending',
    },
  });
}

export async function resolveHandoff(db: PrismaClient, handoffId: string) {
  const handoff = await db.humanHandoff.update({
    where: { id: handoffId },
    data: { status: 'resolved', resolvedAt: new Date() },
  });

  await db.conversation.update({
    where: { id: handoff.conversationId },
    data: { status: 'active', assignedTo: null },
  });

  return handoff;
}

export async function listHandoffs(
  db: PrismaClient,
  filters?: { status?: string; assignedTo?: string },
) {
  return db.humanHandoff.findMany({
    where: {
      ...(filters?.status ? { status: filters.status } : {}),
      ...(filters?.assignedTo ? { assignedTo: filters.assignedTo } : {}),
    },
    include: {
      conversation: {
        include: { contact: { select: { id: true, name: true, phone: true } } },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
}
