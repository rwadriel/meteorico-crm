import { z } from 'zod';

export const GROUP_CATEGORIES = ['novo', 'reparticipante', 'veterano', 'aluno', 'geral'] as const;

export const createGroupSchema = z.object({
  campaignId: z.string().uuid(),
  name: z.string().min(1).max(200),
  category: z.enum(GROUP_CATEGORIES),
  whatsappId: z.string().optional().nullable(),
  inviteLink: z.string().url().optional().nullable(),
  capacity: z.number().int().min(1).max(1024).default(256),
  priority: z.number().int().min(0).default(0),
});

export const updateGroupSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  category: z.enum(GROUP_CATEGORIES).optional(),
  whatsappId: z.string().optional().nullable(),
  inviteLink: z.string().url().optional().nullable(),
  capacity: z.number().int().min(1).max(1024).optional(),
  priority: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

export const listGroupsSchema = z.object({
  campaignId: z.string().uuid().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
