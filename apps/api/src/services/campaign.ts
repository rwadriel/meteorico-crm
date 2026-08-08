import type { PrismaClient, Prisma } from '@meteorico/database';

interface ListCampaignsOpts {
  status?: string;
  page: number;
  limit: number;
  search?: string;
}

export async function listCampaigns(
  db: PrismaClient,
  opts: ListCampaignsOpts,
) {
  const where: Record<string, unknown> = {};

  if (opts.status) {
    where.status = opts.status;
  }

  if (opts.search) {
    where.OR = [
      { name: { contains: opts.search, mode: 'insensitive' } },
      { slug: { contains: opts.search, mode: 'insensitive' } },
    ];
  }

  const [campaigns, total] = await Promise.all([
    db.campaign.findMany({
      where,
      orderBy: [{ editionNumber: 'desc' }, { createdAt: 'desc' }],
      skip: (opts.page - 1) * opts.limit,
      take: opts.limit,
    }),
    db.campaign.count({ where }),
  ]);

  return { campaigns, total, page: opts.page, limit: opts.limit };
}

export async function getCampaign(db: PrismaClient, id: string) {
  const campaign = await db.campaign.findUnique({
    where: { id },
    include: {
      _count: {
        select: {
          groups: true,
          participations: true,
        },
      },
    },
  });

  if (!campaign) {
    throw new Error('Campaign not found');
  }

  return campaign;
}

export async function createCampaign(
  db: PrismaClient,
  data: {
    name: string;
    slug: string;
    editionNumber?: number | null;
    status?: string;
    timezone?: string;
    cartOpenDay?: string;
    captationStartsAt?: Date | null;
    startsAt?: Date | null;
    endsAt?: Date | null;
  },
  userId: string,
) {
  return db.campaign.create({
    data: {
      name: data.name,
      slug: data.slug,
      editionNumber: data.editionNumber ?? null,
      status: data.status ?? 'draft',
      timezone: data.timezone ?? 'America/Sao_Paulo',
      cartOpenDay: data.cartOpenDay ?? 'wednesday',
      captationStartsAt: data.captationStartsAt ?? null,
      startsAt: data.startsAt ?? null,
      endsAt: data.endsAt ?? null,
      createdBy: userId,
    },
  });
}

export async function updateCampaign(
  db: PrismaClient,
  id: string,
  data: Record<string, unknown>,
) {
  const existing = await db.campaign.findUnique({ where: { id } });

  if (!existing) {
    throw new Error('Campaign not found');
  }

  if (existing.status === 'completed' || existing.status === 'archived') {
    throw new Error('Cannot update a campaign that is completed or archived');
  }

  return db.campaign.update({ where: { id }, data });
}

export async function deleteCampaign(db: PrismaClient, id: string) {
  const existing = await db.campaign.findUnique({ where: { id } });

  if (!existing) {
    throw new Error('Campaign not found');
  }

  if (existing.status !== 'draft') {
    throw new Error('Only draft campaigns can be deleted');
  }

  return db.campaign.delete({ where: { id } });
}

export async function duplicateCampaign(
  db: PrismaClient,
  id: string,
  overrides: Record<string, unknown>,
  userId: string,
) {
  const original = await db.campaign.findUnique({
    where: { id },
    include: { groups: true },
  });

  if (!original) {
    throw new Error('Campaign not found');
  }

  const newEditionNumber = original.editionNumber
    ? original.editionNumber + 1
    : undefined;

  const slug =
    (overrides.slug as string) ??
    (newEditionNumber
      ? `${original.slug}-ed${newEditionNumber}`
      : `${original.slug}-copy`);

  const offsetMs = 7 * 24 * 60 * 60 * 1000;

  const captationStartsAt = original.captationStartsAt
    ? new Date(original.captationStartsAt.getTime() + offsetMs)
    : null;

  const startsAt = original.startsAt
    ? new Date(original.startsAt.getTime() + offsetMs)
    : null;

  const endsAt = original.endsAt
    ? new Date(original.endsAt.getTime() + offsetMs)
    : null;

  return db.$transaction(async (tx) => {
    const campaign = await tx.campaign.create({
      data: {
        name: (overrides.name as string) ?? original.name,
        slug,
        editionNumber: newEditionNumber ?? null,
        status: 'draft',
        timezone: original.timezone,
        cartOpenDay: (overrides.cartOpenDay as string) ?? original.cartOpenDay,
        captationStartsAt: (overrides.captationStartsAt as Date) ?? captationStartsAt,
        startsAt: (overrides.startsAt as Date) ?? startsAt,
        endsAt: (overrides.endsAt as Date) ?? endsAt,
        createdBy: userId,
      },
    });

    if (original.groups.length > 0) {
      await tx.group.createMany({
        data: original.groups.map((g) => ({
          campaignId: campaign.id,
          name: g.name,
          category: g.category,
          capacity: g.capacity,
          priority: g.priority,
          isActive: g.isActive,
        })),
      });
    }

    return tx.campaign.findUnique({
      where: { id: campaign.id },
      include: { groups: true },
    });
  });
}

export async function activateCampaign(db: PrismaClient, id: string) {
  const campaign = await db.campaign.findUnique({
    where: { id },
    include: { _count: { select: { groups: true } } },
  });

  if (!campaign) {
    throw new Error('Campaign not found');
  }

  if (campaign.status !== 'draft') {
    throw new Error('Only draft campaigns can be activated');
  }

  if (!campaign.name) {
    throw new Error('Campaign must have a name');
  }

  if (campaign._count.groups === 0) {
    throw new Error('Campaign must have at least one group');
  }

  if (!campaign.startsAt || !campaign.endsAt) {
    throw new Error('Campaign must have startsAt and endsAt dates');
  }

  const activeConflict = await db.campaign.findFirst({
    where: { status: 'active', id: { not: id } },
  });

  if (activeConflict) {
    throw new Error('Another campaign is already active');
  }

  return db.campaign.update({
    where: { id },
    data: { status: 'active' },
  });
}

export async function completeCampaign(db: PrismaClient, id: string) {
  const campaign = await db.campaign.findUnique({ where: { id } });

  if (!campaign) {
    throw new Error('Campaign not found');
  }

  if (campaign.status !== 'active') {
    throw new Error('Only active campaigns can be completed');
  }

  return db.campaign.update({
    where: { id },
    data: { status: 'completed' },
  });
}

export async function archiveCampaign(db: PrismaClient, id: string) {
  const campaign = await db.campaign.findUnique({ where: { id } });

  if (!campaign) {
    throw new Error('Campaign not found');
  }

  if (campaign.status !== 'completed' && campaign.status !== 'historical') {
    throw new Error('Only completed or historical campaigns can be archived');
  }

  return db.campaign.update({
    where: { id },
    data: { status: 'archived' },
  });
}

export async function publishVersion(
  db: PrismaClient,
  campaignId: string,
  config: Prisma.InputJsonValue,
) {
  const campaign = await db.campaign.findUnique({ where: { id: campaignId } });

  if (!campaign) {
    throw new Error('Campaign not found');
  }

  const latest = await db.campaignVersion.findFirst({
    where: { campaignId },
    orderBy: { version: 'desc' },
  });

  const nextVersion = latest ? latest.version + 1 : 1;

  return db.campaignVersion.create({
    data: {
      campaignId,
      version: nextVersion,
      config,
      publishedAt: new Date(),
    },
  });
}

export async function getVersions(db: PrismaClient, campaignId: string) {
  const campaign = await db.campaign.findUnique({ where: { id: campaignId } });

  if (!campaign) {
    throw new Error('Campaign not found');
  }

  return db.campaignVersion.findMany({
    where: { campaignId },
    orderBy: { version: 'desc' },
  });
}
