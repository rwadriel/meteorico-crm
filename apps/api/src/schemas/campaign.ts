import { z } from 'zod';

export const CAMPAIGN_STATUSES = ['draft', 'active', 'completed', 'historical', 'archived'] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const CART_OPEN_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;

export const createCampaignSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
  editionNumber: z.number().int().positive().optional(),
  status: z.enum(CAMPAIGN_STATUSES).default('draft'),
  cartOpenDay: z.enum(CART_OPEN_DAYS).default('wednesday'),
  startsAt: z.string().datetime().optional().nullable(),
  endsAt: z.string().datetime().optional().nullable(),
});

export const updateCampaignSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/).optional(),
  editionNumber: z.number().int().positive().optional().nullable(),
  status: z.enum(CAMPAIGN_STATUSES).optional(),
  cartOpenDay: z.enum(CART_OPEN_DAYS).optional(),
  startsAt: z.string().datetime().optional().nullable(),
  endsAt: z.string().datetime().optional().nullable(),
});

export const duplicateCampaignSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/).optional(),
  editionNumber: z.number().int().positive().optional(),
  startsAt: z.string().datetime().optional().nullable(),
  endsAt: z.string().datetime().optional().nullable(),
});

export const campaignVersionSchema = z.object({
  config: z.record(z.unknown()),
});

export const listCampaignsSchema = z.object({
  status: z.enum(CAMPAIGN_STATUSES).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
});
