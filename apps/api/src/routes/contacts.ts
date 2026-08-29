import type { FastifyInstance } from 'fastify';
import { getClient } from '@meteorico/database';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { z } from 'zod';

const listContactsSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  isStudent: z.enum(['true', 'false']).optional(),
  purchaseStatus: z.enum(['unknown', 'not_purchased', 'purchased']).optional(),
  optOut: z.enum(['true', 'false']).optional(),
});

const updateContactSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  email: z.string().email().max(320).optional().nullable(),
  isStudent: z.boolean().optional(),
  purchaseStatus: z.enum(['unknown', 'not_purchased', 'purchased']).optional(),
  optOut: z.boolean().optional(),
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
    if (query.purchaseStatus) where.purchaseStatus = query.purchaseStatus;
    if (query.optOut !== undefined) {
      where.preferences = query.optOut === 'true'
        ? { some: { channel: 'whatsapp', optedOut: true } }
        : { none: { channel: 'whatsapp', optedOut: true } };
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
          purchaseStatus: true,
          source: true,
          campaignSource: true,
          optOutAt: true,
          totalParticipations: true,
          totalPurchases: true,
          firstSeenAt: true,
          lastSeenAt: true,
          createdAt: true,
          preferences: { where: { channel: 'whatsapp' }, select: { optedOut: true }, take: 1 },
          followupMessages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              status: true,
              submittedAt: true,
              createdAt: true,
              campaign: { select: { name: true } },
            },
          },
        },
      }),
      db.contact.count({ where }),
    ]);

    const masked = contacts.map((c) => ({
      ...c,
      phone: c.phone ? `${c.phone.slice(0, 4)}***${c.phone.slice(-2)}` : null,
      email: c.email ? maskEmail(c.email) : null,
      optOut: c.preferences[0]?.optedOut ?? false,
      lastCampaign: c.followupMessages[0]?.campaign.name ?? null,
      lastSendAt: c.followupMessages[0]?.submittedAt ?? null,
      lastSendStatus: c.followupMessages[0]?.status ?? null,
      preferences: undefined,
      followupMessages: undefined,
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

    const { optOut, ...contactData } = data;
    const updated = await db.$transaction(async (tx) => {
      const contact = await tx.contact.update({
        where: { id },
        data: {
          ...contactData,
          ...(contactData.purchaseStatus === 'purchased' ? { isStudent: true } : {}),
          ...(optOut === true ? { optOutAt: new Date() } : optOut === false ? { optOutAt: null } : {}),
        },
      });
      if (optOut !== undefined) {
        await tx.contactPreference.upsert({
          where: { contactId_channel: { contactId: id, channel: 'whatsapp' } },
          create: { contactId: id, channel: 'whatsapp', optedOut: optOut, reason: 'admin' },
          update: { optedOut: optOut, reason: 'admin', blockedAt: optOut ? new Date() : null },
        });
      }
      return contact;
    });
    return {
      ...updated,
      phone: updated.phone ? `${updated.phone.slice(0, 4)}***${updated.phone.slice(-2)}` : null,
      email: updated.email ? maskEmail(updated.email) : null,
    };
  });

  app.get('/contacts/stats', {
    preHandler: requirePermission('contacts', 'read'),
  }, async () => {
    const [total, buyers, optOuts, eligible] = await Promise.all([
      db.contact.count(),
      db.contact.count({ where: { OR: [{ purchaseStatus: 'purchased' }, { isStudent: true }, { totalPurchases: { gt: 0 } }] } }),
      db.contact.count({ where: { preferences: { some: { channel: 'whatsapp', optedOut: true } } } }),
      db.contact.count({ where: {
        normalizedPhone: { not: null },
        isStudent: false,
        totalPurchases: 0,
        purchaseStatus: { not: 'purchased' },
        NOT: { preferences: { some: { channel: 'whatsapp', optedOut: true } } },
      } }),
    ]);

    return {
      total,
      buyers,
      optOuts,
      eligible,
    };
  });
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  const masked = local.length <= 2 ? '*'.repeat(local.length) : `${local[0]}${'*'.repeat(local.length - 2)}${local[local.length - 1]}`;
  return `${masked}@${domain}`;
}
