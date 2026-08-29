import type { FastifyInstance } from 'fastify';
import { getClient } from '@meteorico/database';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import {
  createTemplate,
  updateTemplate,
  listTemplates,
  getTemplate,
  deactivateTemplate,
  getAllowedVariables,
  renderTemplate,
  validateVariables,
} from '../services/template.js';
import { writeAuditLog } from '../services/audit.js';

export async function templateRoutes(app: FastifyInstance) {
  app.addHook('onRequest', requireAuth);

  app.get('/templates', {
    preHandler: requirePermission('messages', 'read'),
  }, async (request, reply) => {
    const db = getClient();
    const query = request.query as { category?: string };
    const templates = await listTemplates(db, { category: query.category });
    return reply.send(templates);
  });

  app.get<{ Params: { id: string } }>('/templates/:id', {
    preHandler: requirePermission('messages', 'read'),
  }, async (request, reply) => {
    const db = getClient();
    const template = await getTemplate(db, request.params.id);
    if (!template) return reply.status(404).send({ error: 'Template not found' });
    return reply.send(template);
  });

  app.get('/templates/variables', {
    preHandler: requirePermission('messages', 'read'),
  }, async (_request, reply) => {
    return reply.send({ variables: getAllowedVariables() });
  });

  app.post<{
    Body: { name: string; category: string; content: string };
  }>('/templates', {
    preHandler: requirePermission('messages', 'create'),
  }, async (request, reply) => {
    const db = getClient();
    const { name, category, content } = request.body;

    const template = await createTemplate(db, {
      name,
      category,
      content,
      createdBy: request.user!.id,
    });

    await writeAuditLog(db, {
      userId: request.user!.id,
      action: 'create_template',
      resource: 'messages',
      resourceId: template.id,
      newValue: { name, category },
      ipAddress: request.ip,
    });

    return reply.status(201).send(template);
  });

  app.put<{
    Params: { id: string };
    Body: { content: string };
  }>('/templates/:id', {
    preHandler: requirePermission('messages', 'update'),
  }, async (request, reply) => {
    const db = getClient();
    const version = await updateTemplate(db, request.params.id, {
      content: request.body.content,
    });

    await writeAuditLog(db, {
      userId: request.user!.id,
      action: 'update_template',
      resource: 'messages',
      resourceId: request.params.id,
      newValue: { version: version.version },
      ipAddress: request.ip,
    });

    return reply.send(version);
  });

  app.delete<{ Params: { id: string } }>('/templates/:id', {
    preHandler: requirePermission('messages', 'delete'),
  }, async (request, reply) => {
    const db = getClient();
    await deactivateTemplate(db, request.params.id);

    await writeAuditLog(db, {
      userId: request.user!.id,
      action: 'deactivate_template',
      resource: 'messages',
      resourceId: request.params.id,
      ipAddress: request.ip,
    });

    return reply.status(204).send();
  });

  app.post<{
    Body: { content: string; variables: Record<string, string> };
  }>('/templates/preview', {
    preHandler: requirePermission('messages', 'read'),
  }, async (request, reply) => {
    const { content, variables } = request.body;
    const validation = validateVariables(content);
    const rendered = renderTemplate(content, variables);
    return reply.send({ rendered, validation });
  });
}
