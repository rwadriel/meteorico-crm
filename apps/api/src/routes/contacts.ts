import type { FastifyInstance } from 'fastify';
import { getClient } from '@meteorico/database';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { getHistoryQualityCounts } from '../services/participation-history.js';
import { z } from 'zod';

const listContactsSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  isStudent: z.enum(['true', 'false']).optional(),
});

const updateContactSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  email: z.string().email().max(320).optional().nullable(),
  isStudent: z.boolean().optional(),
});

export async function contactRoutes(app: FastifyInstance) {
  const db = getClient();

  app.addHook('onRequest', requireAuth);

  app.get('/contacts', {
    preHandler: requirePermission('contacts', 'read'),
  }, async (request) => {
    const query = listContactsSchema.parse(request.query);
    const where: Record<string, unknown> = {};

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { phone: { contains: query.search } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (query.isStudent !== undefined) {
      where.isStudent = query.isStudent === 'true';
    }

    const [contacts, total] = await Promise.all([
      db.contact.findMany({
        where,
        orderBy: { lastSeenAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          isStudent: true,
          totalParticipations: true,
          totalPurchases: true,
          firstSeenAt: true,
          lastSeenAt: true,
          createdAt: true,
        },
      }),
      db.contact.count({ where }),
    ]);

    const masked = contacts.map((c) => ({
      ...c,
      phone: c.phone ? `${c.phone.slice(0, 4)}***${c.phone.slice(-2)}` : null,
      email: c.email ? maskEmail(c.email) : null,
    }));

    return { contacts: masked, total, page: query.page, limit: query.limit };
  });

  app.get('/contacts/:id', {
    preHandler: requirePermission('contacts', 'read'),
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const contact = await db.contact.findUnique({
      where: { id },
      include: {
        participations: {
          include: { campaign: { select: { name: true, slug: true, editionNumber: true } } },
          orderBy: { createdAt: 'desc' },
        },
        purchases: { orderBy: { purchasedAt: 'desc' }, take: 10 },
        _count: { select: { conversations: true, diagnoses: true, groupEvents: true } },
      },
    });

    if (!contact) {
      return reply.status(404).send({ message: 'Contact not found' });
    }

    return {
      ...contact,
      phone: contact.phone ? `${contact.phone.slice(0, 4)}***${contact.phone.slice(-2)}` : null,
      email: contact.email ? maskEmail(contact.email) : null,
    };
  });

  app.put('/contacts/:id', {
    preHandler: requirePermission('contacts', 'update'),
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const data = updateContactSchema.parse(request.body);

    const existing = await db.contact.findUnique({ where: { id } });
    if (!existing) {
      return reply.status(404).send({ message: 'Contact not found' });
    }

    const updated = await db.contact.update({ where: { id }, data });
    return {
      ...updated,
      phone: updated.phone ? `${updated.phone.slice(0, 4)}***${updated.phone.slice(-2)}` : null,
      email: updated.email ? maskEmail(updated.email) : null,
    };
  });

  app.get('/contacts/stats', {
    preHandler: requirePermission('contacts', 'read'),
  }, async () => {
    const [total, students, withEmail, historyQuality] = await Promise.all([
      db.contact.count(),
      db.contact.count({ where: { isStudent: true } }),
      db.contact.count({ where: { email: { not: null } } }),
      getHistoryQualityCounts(db),
    ]);

    return {
      total,
      students,
      withEmail,
      unresolvedHistory: historyQuality.unresolvedHistory,
      needsReview: historyQuality.needsReview,
    };
  });
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  const masked = local.length <= 2 ? '*'.repeat(local.length) : `${local[0]}${'*'.repeat(local.length - 2)}${local[local.length - 1]}`;
  return `${masked}@${domain}`;
}
