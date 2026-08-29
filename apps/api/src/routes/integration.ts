import type { FastifyInstance } from 'fastify';
import { getClient } from '@meteorico/database';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { getIntegrationHealth, getOrphanGroups, assignOrphanGroup } from '../services/integration.js';
import { writeAuditLog } from '../services/audit.js';

export async function integrationRoutes(app: FastifyInstance) {
  app.addHook('onRequest', requireAuth);

  app.get('/integration/health', {
    preHandler: requirePermission('integration', 'read'),
  }, async (_request, reply) => {
    const db = getClient();
    const status = await getIntegrationHealth(db, 'whatsapp-manager');
    return reply.send(status);
  });

  app.get('/integration/orphan-groups', {
    preHandler: requirePermission('integration', 'read'),
  }, async (_request, reply) => {
    const db = getClient();
    const groups = await getOrphanGroups(db);
    return reply.send({ groups });
  });

  app.post<{
    Params: { groupId: string };
    Body: { campaignId: string };
  }>('/integration/orphan-groups/:groupId/assign', {
    preHandler: requirePermission('integration', 'write'),
  }, async (request, reply) => {
    const db = getClient();
    const { groupId } = request.params;
    const { campaignId } = request.body;

    const group = await assignOrphanGroup(db, groupId, campaignId);

    await writeAuditLog(db, {
      userId: request.user!.id,
      action: 'assign_orphan_group',
      resource: 'integration',
      resourceId: groupId,
      newValue: { campaignId },
      ipAddress: request.ip,
    });

    return reply.send(group);
  });
}
