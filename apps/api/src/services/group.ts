import type { PrismaClient } from '@meteorico/database';

interface ListGroupsOpts {
  campaignId?: string;
  page: number;
  limit: number;
}

export async function listGroups(db: PrismaClient, opts: ListGroupsOpts) {
  const where: Record<string, unknown> = {};

  if (opts.campaignId) {
    where.campaignId = opts.campaignId;
  }

  const [groups, total] = await Promise.all([
    db.group.findMany({
      where,
      orderBy: [{ priority: 'asc' }, { name: 'asc' }],
      skip: (opts.page - 1) * opts.limit,
      take: opts.limit,
    }),
    db.group.count({ where }),
  ]);

  return { groups, total, page: opts.page, limit: opts.limit };
}

export async function getGroup(db: PrismaClient, id: string) {
  const group = await db.group.findUnique({
    where: { id },
    include: { campaign: true },
  });

  if (!group) {
    throw new Error('Group not found');
  }

  return group;
}

export async function createGroup(
  db: PrismaClient,
  data: {
    campaignId: string;
    whatsappId?: string | null;
    name: string;
    category: string;
    inviteLink?: string | null;
    capacity?: number;
    priority?: number;
    isActive?: boolean;
  },
) {
  const campaign = await db.campaign.findUnique({
    where: { id: data.campaignId },
  });

  if (!campaign) {
    throw new Error('Campaign not found');
  }

  if (data.whatsappId) {
    const duplicate = await db.group.findFirst({
      where: {
        whatsappId: data.whatsappId,
        campaignId: data.campaignId,
      },
    });

    if (duplicate) {
      throw new Error('A group with this whatsappId already exists in this campaign');
    }
  }

  return db.group.create({
    data: {
      campaignId: data.campaignId,
      whatsappId: data.whatsappId ?? null,
      name: data.name,
      category: data.category,
      inviteLink: data.inviteLink ?? null,
      capacity: data.capacity ?? 256,
      priority: data.priority ?? 0,
      isActive: data.isActive ?? true,
    },
  });
}

export async function updateGroup(
  db: PrismaClient,
  id: string,
  data: Record<string, unknown>,
) {
  const existing = await db.group.findUnique({ where: { id } });

  if (!existing) {
    throw new Error('Group not found');
  }

  return db.group.update({ where: { id }, data });
}

export async function deleteGroup(db: PrismaClient, id: string) {
  const group = await db.group.findUnique({
    where: { id },
    include: { _count: { select: { memberships: true } } },
  });

  if (!group) {
    throw new Error('Group not found');
  }

  if (group._count.memberships > 0) {
    throw new Error('Cannot delete a group that has memberships');
  }

  return db.group.delete({ where: { id } });
}
