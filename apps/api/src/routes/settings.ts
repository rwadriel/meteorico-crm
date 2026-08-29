import type { FastifyInstance } from 'fastify';
import { getClient } from '@meteorico/database';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { writeAuditLog } from '../services/audit.js';
import { z } from 'zod';

const updateSettingSchema = z.object({
  value: z.unknown(),
  description: z.string().max(500).optional(),
});

export async function settingsRoutes(app: FastifyInstance) {
  const db = getClient();

  app.addHook('onRequest', requireAuth);

  app.get('/settings', {
    preHandler: requirePermission('settings', 'read'),
  }, async () => {
    return db.systemSetting.findMany({
      orderBy: { key: 'asc' },
    });
  });

  app.get('/settings/:key', {
    preHandler: requirePermission('settings', 'read'),
  }, async (request, reply) => {
    const { key } = request.params as { key: string };
    const setting = await db.systemSetting.findUnique({ where: { key } });
    if (!setting) {
      return reply.status(404).send({ message: 'Setting not found' });
    }
    return setting;
  });

  app.put('/settings/:key', {
    preHandler: requirePermission('settings', 'update'),
  }, async (request) => {
    const { key } = request.params as { key: string };
    const data = updateSettingSchema.parse(request.body);

    const setting = await db.systemSetting.upsert({
      where: { key },
      create: {
        key,
        value: data.value as never,
        description: data.description ?? '',
        updatedBy: request.user!.id,
      },
      update: {
        value: data.value as never,
        description: data.description,
        updatedBy: request.user!.id,
      },
    });

    await writeAuditLog(db, {
      userId: request.user!.id,
      action: 'setting.update',
      resource: 'settings',
      resourceId: key,
      newValue: data,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] ?? '',
    });

    return setting;
  });
}
