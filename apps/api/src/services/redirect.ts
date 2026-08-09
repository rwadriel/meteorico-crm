import type { PrismaClient } from '@meteorico/database';
import { randomBytes } from 'node:crypto';

const CODE_LENGTH = 8;
const ALLOWED_DESTINATIONS = new Set([
  'api.whatsapp.com',
  'wa.me',
  'chat.whatsapp.com',
]);

function generateCode(): string {
  return randomBytes(CODE_LENGTH)
    .toString('base64url')
    .slice(0, CODE_LENGTH);
}

function isAllowedDestination(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ALLOWED_DESTINATIONS.has(parsed.hostname);
  } catch {
    return false;
  }
}

export function addAllowedDestination(hostname: string) {
  ALLOWED_DESTINATIONS.add(hostname);
}

export async function createRedirectLink(
  db: PrismaClient,
  data: {
    campaignId: string;
    destinationUrl: string;
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
    utmContent?: string;
    fbclid?: string;
    metaCampaignId?: string;
    metaAdsetId?: string;
    metaAdId?: string;
    creativeId?: string;
    placement?: string;
    maxUses?: number;
    expiresAt?: Date;
    createdBy: string;
  },
) {
  if (!isAllowedDestination(data.destinationUrl)) {
    throw new Error('Destination URL not in allowlist');
  }

  const campaign = await db.campaign.findUnique({
    where: { id: data.campaignId },
  });
  if (!campaign) throw new Error('Campaign not found');

  let code: string;
  let attempts = 0;
  do {
    code = generateCode();
    const existing = await db.redirectLink.findUnique({ where: { code } });
    if (!existing) break;
    attempts++;
  } while (attempts < 10);

  if (attempts >= 10) {
    throw new Error('Failed to generate unique code');
  }

  return db.redirectLink.create({
    data: {
      code,
      campaignId: data.campaignId,
      destinationUrl: data.destinationUrl,
      utmSource: data.utmSource ?? '',
      utmMedium: data.utmMedium ?? '',
      utmCampaign: data.utmCampaign ?? '',
      utmContent: data.utmContent ?? '',
      fbclid: data.fbclid ?? '',
      metaCampaignId: data.metaCampaignId ?? null,
      metaAdsetId: data.metaAdsetId ?? null,
      metaAdId: data.metaAdId ?? null,
      creativeId: data.creativeId ?? null,
      placement: data.placement ?? null,
      maxUses: data.maxUses ?? null,
      expiresAt: data.expiresAt ?? null,
      createdBy: data.createdBy,
    },
  });
}

export async function resolveRedirectLink(
  db: PrismaClient,
  code: string,
  visitorInfo: {
    ipAddress: string;
    userAgent: string;
    referer: string;
  },
): Promise<{ url: string; campaignId: string } | null> {
  const link = await db.redirectLink.findUnique({
    where: { code },
  });

  if (!link || !link.isActive) return null;

  if (link.expiresAt && link.expiresAt < new Date()) return null;

  if (link.maxUses !== null && link.usedCount >= link.maxUses) return null;

  await db.redirectLink.update({
    where: { id: link.id },
    data: { usedCount: { increment: 1 } },
  });

  await db.trackingClick.create({
    data: {
      linkId: link.id,
      url: link.destinationUrl,
      referer: visitorInfo.referer,
      ipAddress: visitorInfo.ipAddress,
      userAgent: visitorInfo.userAgent,
    },
  });

  return { url: link.destinationUrl, campaignId: link.campaignId };
}

export async function listRedirectLinks(
  db: PrismaClient,
  campaignId?: string,
) {
  return db.redirectLink.findMany({
    where: campaignId ? { campaignId } : {},
    orderBy: { createdAt: 'desc' },
    include: {
      campaign: { select: { name: true, slug: true } },
      _count: { select: { clicks: true } },
    },
  });
}

export async function getRedirectLink(
  db: PrismaClient,
  id: string,
) {
  return db.redirectLink.findUnique({
    where: { id },
    include: {
      campaign: { select: { name: true, slug: true } },
      _count: { select: { clicks: true } },
    },
  });
}

export async function deactivateRedirectLink(
  db: PrismaClient,
  id: string,
) {
  return db.redirectLink.update({
    where: { id },
    data: { isActive: false },
  });
}

export async function activateRedirectLink(
  db: PrismaClient,
  id: string,
) {
  return db.redirectLink.update({
    where: { id },
    data: { isActive: true },
  });
}
