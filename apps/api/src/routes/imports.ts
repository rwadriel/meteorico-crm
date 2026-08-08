import type { FastifyInstance } from 'fastify';
import { getClient } from '@meteorico/database';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { writeAuditLog } from '../services/audit.js';
import { importPreviewSchema } from '../schemas/import.js';
import {
  createImportPreview,
  processContactsImport,
  processParticipationsImport,
  rollbackImport,
  getImport,
  listImports,
} from '../services/import.js';

export async function importRoutes(app: FastifyInstance) {
  const db = getClient();

  app.addHook('onRequest', requireAuth);

  app.get('/imports', {
    preHandler: requirePermission('imports', 'read'),
  }, async (request) => {
    const { page = '1', limit = '20' } = request.query as Record<string, string>;
    return listImports(db, {
      page: parseInt(page, 10) || 1,
      limit: parseInt(limit, 10) || 20,
    });
  });

  app.get('/imports/:id', {
    preHandler: requirePermission('imports', 'read'),
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      return await getImport(db, id);
    } catch {
      return reply.status(404).send({ message: 'Import not found' });
    }
  });

  app.post('/imports/preview', {
    preHandler: requirePermission('imports', 'create'),
  }, async (request, reply) => {
    const contentType = request.headers['content-type'] ?? '';

    let csvContent: string;
    let filename: string;
    let importType: string;

    if (contentType.includes('multipart/form-data')) {
      const parts = request.parts();
      let fileContent = '';
      let fileName = 'upload.csv';
      let type = 'contacts';

      for await (const part of parts) {
        if (part.type === 'file') {
          const chunks: Buffer[] = [];
          for await (const chunk of part.file) {
            chunks.push(chunk);
          }
          fileContent = Buffer.concat(chunks).toString('utf-8');
          fileName = part.filename ?? 'upload.csv';
        } else if (part.fieldname === 'type') {
          type = (part as { value: string }).value;
        }
      }

      if (!fileContent) {
        return reply.status(400).send({ message: 'No file provided' });
      }

      csvContent = fileContent;
      filename = fileName;
      importType = type;
    } else {
      const body = request.body as { content: string; filename?: string; type: string };
      const parsed = importPreviewSchema.parse(body);
      csvContent = body.content;
      filename = body.filename ?? 'upload.csv';
      importType = parsed.type;
    }

    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return reply.status(400).send({ message: 'Invalid filename' });
    }

    try {
      const result = await createImportPreview(db, importType, filename, csvContent, request.user!.id);
      await writeAuditLog(db, {
        userId: request.user!.id,
        action: 'import.preview',
        resource: 'imports',
        resourceId: result.import.id,
        newValue: { type: importType, filename, totalRows: result.import.totalRows },
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'] ?? '',
      });
      return reply.status(201).send(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Preview failed';
      return reply.status(400).send({ message });
    }
  });

  app.post('/imports/:id/confirm', {
    preHandler: requirePermission('imports', 'create'),
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const imp = await getImport(db, id);

      if (imp.status !== 'previewing') {
        return reply.status(400).send({ message: 'Import is not in preview state' });
      }

      let result;
      if (imp.type === 'contacts') {
        result = await processContactsImport(db, id);
      } else {
        result = await processParticipationsImport(db, id);
      }

      await writeAuditLog(db, {
        userId: request.user!.id,
        action: 'import.confirm',
        resource: 'imports',
        resourceId: id,
        newValue: { processedRows: result.processedRows, errorRows: result.errorRows },
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'] ?? '',
      });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Import failed';
      return reply.status(400).send({ message });
    }
  });

  app.post('/imports/:id/rollback', {
    preHandler: requirePermission('imports', 'delete'),
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const result = await rollbackImport(db, id);
      await writeAuditLog(db, {
        userId: request.user!.id,
        action: 'import.rollback',
        resource: 'imports',
        resourceId: id,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'] ?? '',
      });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Rollback failed';
      return reply.status(400).send({ message });
    }
  });
}
