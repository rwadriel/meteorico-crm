import type { FastifyInstance } from 'fastify';
import { getClient } from '@meteorico/database';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import {
  createDocument,
  updateDocument,
  listDocuments,
  getDocument,
  deactivateDocument,
} from '../services/knowledge.js';
import { writeAuditLog } from '../services/audit.js';

export async function knowledgeRoutes(app: FastifyInstance) {
  app.addHook('onRequest', requireAuth);

  app.get('/knowledge', {
    preHandler: requirePermission('settings', 'read'),
  }, async (request, reply) => {
    const db = getClient();
    const query = request.query as { category?: string };
    const docs = await listDocuments(db, { category: query.category, isActive: true });
    return reply.send(docs);
  });

  app.get<{ Params: { id: string } }>('/knowledge/:id', {
    preHandler: requirePermission('settings', 'read'),
  }, async (request, reply) => {
    const db = getClient();
    const doc = await getDocument(db, request.params.id);
    if (!doc) return reply.status(404).send({ error: 'Document not found' });
    return reply.send(doc);
  });

  app.post<{
    Body: { title: string; content: string; category: string };
  }>('/knowledge', {
    preHandler: requirePermission('settings', 'update'),
  }, async (request, reply) => {
    const db = getClient();
    const { title, content, category } = request.body;

    const doc = await createDocument(db, {
      title,
      content,
      category,
      createdBy: request.user!.id,
    });

    await writeAuditLog(db, {
      userId: request.user!.id,
      action: 'create_knowledge_doc',
      resource: 'settings',
      resourceId: doc.id,
      newValue: { title, category },
      ipAddress: request.ip,
    });

    return reply.status(201).send(doc);
  });

  app.put<{
    Params: { id: string };
    Body: { title?: string; content?: string; category?: string };
  }>('/knowledge/:id', {
    preHandler: requirePermission('settings', 'update'),
  }, async (request, reply) => {
    const db = getClient();
    const doc = await updateDocument(db, request.params.id, request.body);

    await writeAuditLog(db, {
      userId: request.user!.id,
      action: 'update_knowledge_doc',
      resource: 'settings',
      resourceId: request.params.id,
      newValue: { title: doc.title },
      ipAddress: request.ip,
    });

    return reply.send(doc);
  });

  app.delete<{ Params: { id: string } }>('/knowledge/:id', {
    preHandler: requirePermission('settings', 'update'),
  }, async (request, reply) => {
    const db = getClient();
    await deactivateDocument(db, request.params.id);

    await writeAuditLog(db, {
      userId: request.user!.id,
      action: 'deactivate_knowledge_doc',
      resource: 'settings',
      resourceId: request.params.id,
      ipAddress: request.ip,
    });

    return reply.status(204).send();
  });
}
