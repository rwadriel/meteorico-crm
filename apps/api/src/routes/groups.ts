import type { FastifyInstance } from 'fastify';
import { getClient } from '@meteorico/database';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { writeAuditLog } from '../services/audit.js';
import {
  createGroupSchema,
  updateGroupSchema,
  listGroupsSchema,
} from '../schemas/group.js';
import {
  listGroups,
  getGroup,
  createGroup,
  updateGroup,
  deleteGroup,
} from '../services/group.js';

export async function groupRoutes(app: FastifyInstance) {
  const db = getClient();

  app.addHook('onRequest', requireAuth);

  app.get('/groups', {
    preHandler: requirePermission('groups', 'read'),
  }, async (request) => {
    const query = listGroupsSchema.parse(request.query);
    return listGroups(db, query);
  });

  app.get('/groups/:id', {
    preHandler: requirePermission('groups', 'read'),
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      return await getGroup(db, id);
    } catch {
      return reply.status(404).send({ message: 'Group not found' });
    }
  });

  app.post('/groups', {
    preHandler: requirePermission('groups', 'create'),
  }, async (request, reply) => {
    const data = createGroupSchema.parse(request.body);
    try {
      const group = await createGroup(db, data);
      await writeAuditLog(db, {
        userId: request.user!.id,
        action: 'group.create',
        resource: 'groups',
        resourceId: group.id,
        newValue: { name: data.name, category: data.category, campaignId: data.campaignId },
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'] ?? '',
      });
      return reply.status(201).send(group);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Create failed';
      const status = message.includes('not found') ? 404 : message.includes('already exists') ? 409 : 400;
      return reply.status(status).send({ message });
    }
  });

  app.put('/groups/:id', {
    preHandler: requirePermission('groups', 'update'),
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const data = updateGroupSchema.parse(request.body);
    try {
      const group = await updateGroup(db, id, data);
      await writeAuditLog(db, {
        userId: request.user!.id,
        action: 'group.update',
        resource: 'groups',
        resourceId: id,
        newValue: data,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'] ?? '',
      });
      return group;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Update failed';
      return reply.status(400).send({ message });
    }
  });

  app.delete('/groups/:id', {
    preHandler: requirePermission('groups', 'delete'),
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      await deleteGroup(db, id);
      await writeAuditLog(db, {
        userId: request.user!.id,
        action: 'group.delete',
        resource: 'groups',
        resourceId: id,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'] ?? '',
      });
      return { message: 'Deleted' };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Delete failed';
      return reply.status(400).send({ message });
    }
  });
}
