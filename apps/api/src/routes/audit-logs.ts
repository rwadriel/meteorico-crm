import type { FastifyInstance } from 'fastify';
import { getClient } from '@meteorico/database';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { z } from 'zod';

const listAuditLogsSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  resource: z.string().optional(),
  action: z.string().optional(),
  userId: z.string().uuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export async function auditRoutes(app: FastifyInstance) {
  const db = getClient();

  app.addHook('onRequest', requireAuth);

  app.get('/audit-logs', {
    preHandler: requirePermission('settings', 'read'),
  }, async (request) => {
    const query = listAuditLogsSchema.parse(request.query);
    const where: Record<string, unknown> = {};

    if (query.resource) where.resource = query.resource;
    if (query.action) where.action = { contains: query.action };
    if (query.userId) where.userId = query.userId;
    if (query.from || query.to) {
      where.createdAt = {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lte: new Date(query.to) } : {}),
      };
    }

    const [logs, total] = await Promise.all([
      db.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: {
          user: { select: { name: true, email: true } },
        },
      }),
      db.auditLog.count({ where }),
    ]);

    return { logs, total, page: query.page, limit: query.limit };
  });

  app.get('/audit-logs/resources', {
    preHandler: requirePermission('settings', 'read'),
  }, async () => {
    const resources = await db.auditLog.findMany({
      distinct: ['resource'],
      select: { resource: true },
    });
    return resources.map((r) => r.resource);
  });
}
