import type { FastifyInstance } from 'fastify';
import { getClient } from '@meteorico/database';
import { z } from 'zod';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { writeAuditLog } from '../services/audit.js';
import { getAudienceLists } from '../services/followup.js';

const updateSchema = z.object({ name: z.string().trim().min(1).max(160) });
const listSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export async function contactListRoutes(app: FastifyInstance) {
  const db = getClient();
  const read = [requireAuth, requirePermission('contacts', 'read')];
  const update = [requireAuth, requirePermission('contacts', 'update')];

  app.get('/contact-lists', { preHandler: read }, async () => ({
    audiences: await getAudienceLists(db),
  }));

  app.get('/contact-lists/:id/contacts', { preHandler: read }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const query = listSchema.parse(request.query);
    const list = await db.contactList.findFirst({ where: { id, isActive: true } });
    if (!list) return reply.status(404).send({ message: 'Público não encontrado' });
    const where = { listMemberships: { some: { listId: id } } };
    const [contacts, total] = await Promise.all([
      db.contact.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: {
          id: true,
          name: true,
          normalizedPhone: true,
          purchaseStatus: true,
          isStudent: true,
          totalPurchases: true,
          preferences: { where: { channel: 'whatsapp' }, take: 1 },
        },
      }),
      db.contact.count({ where }),
    ]);
    return {
      list,
      total,
      page: query.page,
      limit: query.limit,
      contacts: contacts.map((contact) => {
        const preference = contact.preferences[0];
        const buyer =
          contact.isStudent || contact.totalPurchases > 0 || contact.purchaseStatus === 'purchased';
        return {
          id: contact.id,
          name: contact.name,
          phone: maskPhone(contact.normalizedPhone),
          eligible: Boolean(contact.normalizedPhone) && !buyer && !preference?.optedOut,
          exclusion: !contact.normalizedPhone
            ? 'Telefone inválido'
            : buyer
              ? 'Comprador'
              : preference?.optedOut
                ? 'Opt-out'
                : null,
          consentSource: preference?.optInSource || null,
          consentAt: preference?.optedInAt || null,
        };
      }),
    };
  });

  app.put('/contact-lists/:id', { preHandler: update }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const input = updateSchema.parse(request.body);
    const existing = await db.contactList.findFirst({ where: { id, isActive: true } });
    if (!existing) return reply.status(404).send({ message: 'Público não encontrado' });
    const audience = await db.contactList.update({ where: { id }, data: { name: input.name } });
    await writeAuditLog(db, {
      userId: request.user!.id,
      action: 'contact_list.rename',
      resource: 'contacts',
      resourceId: id,
      oldValue: { name: existing.name },
      newValue: { name: input.name },
      ipAddress: request.ip,
    });
    return audience;
  });

  app.delete('/contact-lists/:id', { preHandler: update }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await db.contactList.findFirst({ where: { id, isActive: true } });
    if (!existing) return reply.status(404).send({ message: 'Público não encontrado' });
    await db.contactList.update({ where: { id }, data: { isActive: false } });
    await writeAuditLog(db, {
      userId: request.user!.id,
      action: 'contact_list.archive',
      resource: 'contacts',
      resourceId: id,
      oldValue: { name: existing.name },
      ipAddress: request.ip,
    });
    return reply.status(204).send();
  });
}

function maskPhone(phone: string | null): string | null {
  if (!phone) return null;
  return phone.length < 8 ? '***' : `${phone.slice(0, 4)}***${phone.slice(-2)}`;
}
