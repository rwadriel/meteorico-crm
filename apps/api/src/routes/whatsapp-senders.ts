import type { FastifyInstance } from 'fastify';
import { getClient } from '@meteorico/database';
import { z } from 'zod';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { writeAuditLog } from '../services/audit.js';
import {
  listWhatsAppSenders,
  syncWhatsAppSenders,
  updateWhatsAppSender,
  WhatsAppSenderError,
} from '../services/whatsapp-sender.js';

const updateSchema = z
  .object({
    internalName: z.string().trim().min(1).max(80).optional(),
    isDefault: z.boolean().optional(),
    isActive: z.boolean().optional(),
    sendEnabled: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Informe ao menos uma alteração.');

export async function whatsappSenderRoutes(app: FastifyInstance) {
  const db = getClient();
  app.addHook('onRequest', requireAuth);

  app.get(
    '/whatsapp/senders',
    { preHandler: requirePermission('campaigns', 'read') },
    async () => ({ senders: await listWhatsAppSenders(db) }),
  );

  app.post(
    '/whatsapp/senders/sync',
    { preHandler: requirePermission('settings', 'update') },
    async (request, reply) => {
      try {
        const result = await syncWhatsAppSenders(db);
        await writeAuditLog(db, {
          userId: request.user!.id,
          action: 'whatsapp_sender.sync',
          resource: 'settings',
          newValue: { synced: result.synced },
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'] ?? '',
        });
        return result;
      } catch (error) {
        if (error instanceof WhatsAppSenderError) {
          return reply.status(error.statusCode).send({ message: error.message });
        }
        throw error;
      }
    },
  );

  app.patch(
    '/whatsapp/senders/:id',
    { preHandler: requirePermission('settings', 'update') },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const input = updateSchema.parse(request.body);
      try {
        const sender = await updateWhatsAppSender(db, id, input);
        await writeAuditLog(db, {
          userId: request.user!.id,
          action: 'whatsapp_sender.update',
          resource: 'settings',
          resourceId: id,
          newValue: input,
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'] ?? '',
        });
        return sender;
      } catch (error) {
        if (error instanceof WhatsAppSenderError) {
          return reply.status(error.statusCode).send({ message: error.message });
        }
        throw error;
      }
    },
  );
}
