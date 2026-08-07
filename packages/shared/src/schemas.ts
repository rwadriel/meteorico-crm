import { z } from 'zod';

/** Validates an E.164 phone number (digits only, starting with country code). */
export const phoneSchema = z
  .string()
  .regex(/^\d{12,13}$/, 'Phone must be in E.164 format (digits only, 12-13 chars for Brazil)');

/** Validates an email address. */
export const emailSchema = z.string().email('Invalid email address');

/** Validates a UUID v4. */
export const uuidSchema = z
  .string()
  .uuid('Invalid UUID format');

/** Pagination parameters with defaults. */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/** Date range filter (both optional). */
export const dateRangeSchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export type Pagination = z.infer<typeof paginationSchema>;
export type DateRange = z.infer<typeof dateRangeSchema>;
