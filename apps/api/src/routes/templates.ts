import type { FastifyInstance, FastifyReply } from 'fastify';
import { getClient } from '@meteorico/database';
import { z } from 'zod';
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
import {
  MetaTemplateError,
  analyzeTemplateCategory,
  createAndSubmitMetaTemplate,
  deleteMetaTemplate,
  listManagedMetaTemplates,
  syncMetaTemplates,
} from '../services/meta-template.js';

const metaTemplateSchema = z.object({
  name: z.string().trim().min(3).max(120),
  label: z.string().trim().max(120).optional(),
  language: z.string().trim().default('pt_BR'),
  category: z.enum(['MARKETING', 'UTILITY']),
  body: z.string().trim().min(1).max(1024),
  footer: z.string().trim().max(60).optional(),
  exampleValues: z.array(z.string().trim().min(1).max(1024)).max(10).optional(),
  allowCategoryChange: z.boolean().default(true),
});

const classifySchema = z.object({ body: z.string().trim().min(1).max(1024) });

export async function templateRoutes(app: FastifyInstance) {
  app.addHook('onRequest', requireAuth);

  app.get(
    '/templates',
    {
      preHandler: requirePermission('messages', 'read'),
    },
    async (request, reply) => {
      const db = getClient();
      const query = request.query as { category?: string };
      const templates = await listTemplates(db, { category: query.category });
      return reply.send(templates);
    },
  );

  app.get(
    '/templates/meta',
    {
      preHandler: requirePermission('messages', 'read'),
    },
    async (_request, reply) => {
      const templates = await listManagedMetaTemplates(getClient());
      return reply.send({ templates: templates.map(serializeManagedTemplate) });
    },
  );

  app.post(
    '/templates/meta/classify',
    {
      preHandler: requirePermission('messages', 'read'),
    },
    async (request, reply) => {
      const { body } = classifySchema.parse(request.body);
      return reply.send(analyzeTemplateCategory(body));
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/templates/meta/:id',
    {
      preHandler: requirePermission('messages', 'delete'),
    },
    async (request, reply) => {
      try {
        const template = await deleteMetaTemplate(getClient(), request.params.id);
        await writeAuditLog(getClient(), {
          userId: request.user!.id,
          action: 'meta_template.delete',
          resource: 'messages',
          resourceId: template.id,
          oldValue: { name: template.name, language: template.language },
          ipAddress: request.ip,
        });
        return reply.status(204).send();
      } catch (error) {
        return sendMetaTemplateError(reply, error);
      }
    },
  );

  app.post(
    '/templates/meta/sync',
    {
      preHandler: requirePermission('messages', 'update'),
    },
    async (request, reply) => {
      try {
        const result = await syncMetaTemplates(getClient(), request.user!.id);
        await writeAuditLog(getClient(), {
          userId: request.user!.id,
          action: 'meta_template.sync',
          resource: 'messages',
          newValue: result,
          ipAddress: request.ip,
        });
        return reply.send(result);
      } catch (error) {
        return sendMetaTemplateError(reply, error);
      }
    },
  );

  app.post(
    '/templates/meta',
    {
      preHandler: requirePermission('messages', 'create'),
    },
    async (request, reply) => {
      const input = metaTemplateSchema.parse(request.body);
      try {
        const template = await createAndSubmitMetaTemplate(getClient(), request.user!.id, input);
        await writeAuditLog(getClient(), {
          userId: request.user!.id,
          action: 'meta_template.submit',
          resource: 'messages',
          resourceId: template.id,
          newValue: {
            name: template.name,
            requestedCategory: template.requestedCategory,
            metaCategory: template.metaCategory,
            metaStatus: template.metaStatus,
          },
          ipAddress: request.ip,
        });
        return reply.status(201).send(serializeManagedTemplate(template));
      } catch (error) {
        return sendMetaTemplateError(reply, error);
      }
    },
  );

  app.get<{ Params: { id: string } }>(
    '/templates/:id',
    {
      preHandler: requirePermission('messages', 'read'),
    },
    async (request, reply) => {
      const db = getClient();
      const template = await getTemplate(db, request.params.id);
      if (!template) return reply.status(404).send({ error: 'Template not found' });
      return reply.send(template);
    },
  );

  app.get(
    '/templates/variables',
    {
      preHandler: requirePermission('messages', 'read'),
    },
    async (_request, reply) => {
      return reply.send({ variables: getAllowedVariables() });
    },
  );

  app.post<{
    Body: { name: string; category: string; content: string };
  }>(
    '/templates',
    {
      preHandler: requirePermission('messages', 'create'),
    },
    async (request, reply) => {
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
    },
  );

  app.put<{
    Params: { id: string };
    Body: { content: string };
  }>(
    '/templates/:id',
    {
      preHandler: requirePermission('messages', 'update'),
    },
    async (request, reply) => {
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
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/templates/:id',
    {
      preHandler: requirePermission('messages', 'delete'),
    },
    async (request, reply) => {
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
    },
  );

  app.post<{
    Body: { content: string; variables: Record<string, string> };
  }>(
    '/templates/preview',
    {
      preHandler: requirePermission('messages', 'read'),
    },
    async (request, reply) => {
      const { content, variables } = request.body;
      const validation = validateVariables(content);
      const rendered = renderTemplate(content, variables);
      return reply.send({ rendered, validation });
    },
  );
}

function serializeManagedTemplate(
  template: Awaited<ReturnType<typeof listManagedMetaTemplates>>[number],
) {
  const current = template.versions[0];
  return {
    id: template.id,
    name: template.name,
    label: template.label || template.name,
    language: template.language,
    requestedCategory: template.requestedCategory || template.category,
    metaCategory: template.metaCategory,
    status: template.metaStatus,
    rejectionReason: template.metaRejectedReason,
    qualityRating: template.metaQualityRating,
    allowCategoryChange: template.allowCategoryChange,
    submittedAt: template.submittedAt,
    syncedAt: template.metaSyncedAt,
    body: current?.content ?? '',
    footer: current?.footer ?? '',
    variableCount: Array.isArray(current?.variables) ? current.variables.length : 0,
    exampleValues: Array.isArray(current?.exampleValues) ? current.exampleValues : [],
  };
}

function sendMetaTemplateError(reply: FastifyReply, error: unknown) {
  if (error instanceof MetaTemplateError) {
    return reply.status(error.httpStatus).send({
      message: error.message,
      code: error.metaCode ? `META_${error.metaCode}` : 'META_TEMPLATE_ERROR',
    });
  }
  throw error;
}
