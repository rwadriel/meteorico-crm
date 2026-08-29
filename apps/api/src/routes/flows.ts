import type { FastifyInstance } from 'fastify';
import { getClient } from '@meteorico/database';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import {
  createFlow,
  addStep,
  publishFlow,
  getFlow,
  listFlows,
  newFlowVersion,
} from '../services/flow.js';
import { writeAuditLog } from '../services/audit.js';

export async function flowRoutes(app: FastifyInstance) {
  app.addHook('onRequest', requireAuth);

  app.get('/flows', {
    preHandler: requirePermission('messages', 'read'),
  }, async (request, reply) => {
    const db = getClient();
    const query = request.query as { isActive?: string };
    const isActive = query.isActive === 'true' ? true : query.isActive === 'false' ? false : undefined;
    const flows = await listFlows(db, { isActive });
    return reply.send(flows);
  });

  app.get<{ Params: { id: string } }>('/flows/:id', {
    preHandler: requirePermission('messages', 'read'),
  }, async (request, reply) => {
    const db = getClient();
    const flow = await getFlow(db, request.params.id);
    if (!flow) return reply.status(404).send({ error: 'Flow not found' });
    return reply.send(flow);
  });

  app.post<{
    Body: { name: string; description: string; trigger: string };
  }>('/flows', {
    preHandler: requirePermission('messages', 'create'),
  }, async (request, reply) => {
    const db = getClient();
    const { name, description, trigger } = request.body;

    const flow = await createFlow(db, {
      name,
      description,
      trigger,
      createdBy: request.user!.id,
    });

    await writeAuditLog(db, {
      userId: request.user!.id,
      action: 'create_flow',
      resource: 'messages',
      resourceId: flow.id,
      newValue: { name, trigger },
      ipAddress: request.ip,
    });

    return reply.status(201).send(flow);
  });

  app.post<{
    Params: { versionId: string };
    Body: { stepType: string; config: Record<string, unknown>; order: number; nextStepId?: string };
  }>('/flows/versions/:versionId/steps', {
    preHandler: requirePermission('messages', 'create'),
  }, async (request, reply) => {
    const db = getClient();
    const { stepType, config, order, nextStepId } = request.body;

    const step = await addStep(db, request.params.versionId, {
      stepType,
      config: config as never,
      order,
      nextStepId,
    });

    return reply.status(201).send(step);
  });

  app.post<{
    Params: { id: string };
  }>('/flows/:id/publish', {
    preHandler: requirePermission('messages', 'update'),
  }, async (request, reply) => {
    const db = getClient();
    const version = await publishFlow(db, request.params.id);

    await writeAuditLog(db, {
      userId: request.user!.id,
      action: 'publish_flow',
      resource: 'messages',
      resourceId: request.params.id,
      newValue: { version: version.version },
      ipAddress: request.ip,
    });

    return reply.send(version);
  });

  app.post<{
    Params: { id: string };
  }>('/flows/:id/versions', {
    preHandler: requirePermission('messages', 'update'),
  }, async (request, reply) => {
    const db = getClient();
    const version = await newFlowVersion(db, request.params.id);
    return reply.status(201).send(version);
  });
}
