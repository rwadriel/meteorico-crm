import type { FastifyInstance } from 'fastify';
import { getClient } from '@meteorico/database';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { createHandoff, resolveHandoff, listHandoffs } from '../services/handoff.js';
import { writeAuditLog } from '../services/audit.js';

export async function handoffRoutes(app: FastifyInstance) {
  app.addHook('onRequest', requireAuth);

  app.get('/handoffs', {
    preHandler: requirePermission('messages', 'read'),
  }, async (request, reply) => {
    const db = getClient();
    const query = request.query as { status?: string };
    const handoffs = await listHandoffs(db, { status: query.status });
    return reply.send(handoffs);
  });

  app.post<{
    Body: { conversationId: string; assignedTo: string; reason: string };
  }>('/handoffs', {
    preHandler: requirePermission('messages', 'create'),
  }, async (request, reply) => {
    const db = getClient();
    const { conversationId, assignedTo, reason } = request.body;

    const handoff = await createHandoff(db, { conversationId, assignedTo, reason });

    await writeAuditLog(db, {
      userId: request.user!.id,
      action: 'create_handoff',
      resource: 'messages',
      resourceId: handoff.id,
      newValue: { conversationId, assignedTo, reason },
      ipAddress: request.ip,
    });

    return reply.status(201).send(handoff);
  });

  app.post<{
    Params: { id: string };
  }>('/handoffs/:id/resolve', {
    preHandler: requirePermission('messages', 'update'),
  }, async (request, reply) => {
    const db = getClient();
    const handoff = await resolveHandoff(db, request.params.id);

    await writeAuditLog(db, {
      userId: request.user!.id,
      action: 'resolve_handoff',
      resource: 'messages',
      resourceId: request.params.id,
      ipAddress: request.ip,
    });

    return reply.send(handoff);
  });
}
