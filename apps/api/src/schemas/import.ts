import { z } from 'zod';

export const IMPORT_TYPES = ['contacts', 'participations'] as const;
export const IMPORT_STATUSES = [
  'pending',
  'previewing',
  'processing',
  'done',
  'failed',
  'rolled_back',
] as const;

export const importPreviewSchema = z.object({
  type: z.enum(IMPORT_TYPES),
  audienceName: z.string().trim().min(1).max(120).optional(),
  consentSource: z.string().trim().min(1).max(160).optional(),
  consentAt: z.string().datetime().optional(),
});

export const importConfirmSchema = z.object({
  importId: z.string().uuid(),
});

export const importRollbackSchema = z.object({
  importId: z.string().uuid(),
});
