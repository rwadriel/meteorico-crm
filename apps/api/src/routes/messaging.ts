import type { FastifyInstance } from 'fastify';
import { getClient } from '@meteorico/database';
import { OutboundBlockedError, assertStagingRecipientAllowed } from '@meteorico/shared';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import {
  createRedirectLink,
  listRedirectLinks,
  getRedirectLink,
  deactivateRedirectLink,
  activateRedirectLink,
} from '../services/redirect.js';
import { optOutContact, optInContact, attributeConversation } from '../services/conversation.js';
import { writeAuditLog } from '../services/audit.js';
import { enqueueOutboundMessage } from '../queues/outbound-message.js';

export async function messagingRoutes(app: FastifyInstance) {
  app.addHook('onRequest', requireAuth);

  app.get(
    '/messaging/conversations',
    {
      preHandler: requirePermission('messages', 'read'),
    },
    async (request, reply) => {
      const db = getClient();
      const query = request.query as { search?: string; limit?: string };
      const search = query.search?.trim().slice(0, 80) ?? '';
      const requestedLimit = Number.parseInt(query.limit ?? '100', 10);
      const limit = Number.isFinite(requestedLimit)
        ? Math.max(10, Math.min(requestedLimit, 200))
        : 100;

      const conversations = await db.conversation.findMany({
        where: {
          messages: { some: {} },
          ...(search
            ? {
                contact: {
                  OR: [
                    { name: { contains: search, mode: 'insensitive' as const } },
                    { phone: { contains: search } },
                    { normalizedPhone: { contains: search } },
                  ],
                },
              }
            : {}),
        },
        include: {
          contact: {
            select: {
              id: true,
              name: true,
              phone: true,
              normalizedPhone: true,
              preferences: {
                where: { channel: 'whatsapp' },
                select: { optedOut: true },
                take: 1,
              },
            },
          },
          participation: {
            select: { campaign: { select: { id: true, name: true } } },
          },
          messages: {
            orderBy: [{ sentAt: 'desc' }, { createdAt: 'desc' }],
            take: 1,
          },
          _count: { select: { messages: true } },
        },
        take: 500,
        orderBy: { startedAt: 'desc' },
      });

      const conversationIds = conversations.map((conversation) => conversation.id);
      const inboundTimes =
        conversationIds.length === 0
          ? []
          : await db.conversationMessage.groupBy({
              by: ['conversationId'],
              where: { conversationId: { in: conversationIds }, direction: 'inbound' },
              _max: { sentAt: true },
            });
      const unreadInboundCounts =
        conversationIds.length === 0
          ? []
          : await db.conversationMessage.groupBy({
              by: ['conversationId'],
              where: {
                conversationId: { in: conversationIds },
                direction: 'inbound',
                readAt: null,
              },
              _count: { _all: true },
            });
      const lastInboundByConversation = new Map(
        inboundTimes.map((entry) => [entry.conversationId, entry._max.sentAt]),
      );
      const unreadByConversation = new Map(
        unreadInboundCounts.map((entry) => [entry.conversationId, entry._count._all]),
      );

      const ordered = conversations
        .map((conversation) => {
          const lastMessage = conversation.messages[0] ?? null;
          const lastInboundAt = lastInboundByConversation.get(conversation.id) ?? null;
          return {
            id: conversation.id,
            status: conversation.status,
            startedAt: conversation.startedAt,
            contact: {
              id: conversation.contact.id,
              name: conversation.contact.name,
              phone: conversation.contact.normalizedPhone ?? conversation.contact.phone ?? '',
              optedOut: conversation.contact.preferences[0]?.optedOut ?? false,
            },
            campaign: conversation.participation?.campaign ?? null,
            lastMessage,
            messageCount: conversation._count.messages,
            awaitingReply: lastMessage?.direction === 'inbound',
            unreadCount: unreadByConversation.get(conversation.id) ?? 0,
            unread: (unreadByConversation.get(conversation.id) ?? 0) > 0,
            ...serviceWindowState(lastInboundAt),
          };
        })
        .sort(
          (left, right) =>
            new Date(right.lastMessage?.sentAt ?? right.startedAt).getTime() -
            new Date(left.lastMessage?.sentAt ?? left.startedAt).getTime(),
        )
        .slice(0, limit);

      return reply.send({
        conversations: ordered,
        summary: {
          total: ordered.length,
          awaitingReply: ordered.filter((conversation) => conversation.awaitingReply).length,
          unread: ordered.filter((conversation) => conversation.unread).length,
        },
      });
    },
  );

  app.get<{
    Params: { conversationId: string };
  }>(
    '/messaging/conversations/:conversationId',
    {
      preHandler: requirePermission('messages', 'read'),
    },
    async (request, reply) => {
      const db = getClient();
      const conversation = await db.conversation.findUnique({
        where: { id: request.params.conversationId },
        include: {
          contact: {
            select: {
              id: true,
              name: true,
              phone: true,
              normalizedPhone: true,
              preferences: {
                where: { channel: 'whatsapp' },
                select: { optedOut: true },
                take: 1,
              },
            },
          },
          participation: {
            select: { campaign: { select: { id: true, name: true } } },
          },
          assignee: { select: { id: true, name: true } },
          messages: {
            orderBy: [{ sentAt: 'desc' }, { createdAt: 'desc' }],
            take: 200,
          },
        },
      });
      if (!conversation) return reply.status(404).send({ message: 'Conversa não encontrada.' });

      const lastInbound = conversation.messages.find((message) => message.direction === 'inbound');
      return reply.send({
        id: conversation.id,
        status: conversation.status,
        startedAt: conversation.startedAt,
        contact: {
          id: conversation.contact.id,
          name: conversation.contact.name,
          phone: conversation.contact.normalizedPhone ?? conversation.contact.phone ?? '',
          optedOut: conversation.contact.preferences[0]?.optedOut ?? false,
        },
        campaign: conversation.participation?.campaign ?? null,
        assignee: conversation.assignee,
        messages: conversation.messages.reverse(),
        ...serviceWindowState(lastInbound?.sentAt ?? null),
      });
    },
  );

  app.patch<{
    Params: { conversationId: string };
  }>(
    '/messaging/conversations/:conversationId/read',
    {
      preHandler: requirePermission('messages', 'update'),
    },
    async (request, reply) => {
      const db = getClient();
      const conversation = await db.conversation.findUnique({
        where: { id: request.params.conversationId },
        select: { id: true },
      });
      if (!conversation) return reply.status(404).send({ message: 'Conversa não encontrada.' });

      const result = await db.conversationMessage.updateMany({
        where: {
          conversationId: conversation.id,
          direction: 'inbound',
          readAt: null,
        },
        data: { readAt: new Date() },
      });

      return reply.send({ success: true, markedRead: result.count });
    },
  );

  app.get(
    '/messaging/redirect-links',
    {
      preHandler: requirePermission('messages', 'read'),
    },
    async (request, reply) => {
      const db = getClient();
      const { campaignId } = request.query as { campaignId?: string };
      const links = await listRedirectLinks(db, campaignId);
      return reply.send({ links });
    },
  );

  app.get<{
    Params: { id: string };
  }>(
    '/messaging/redirect-links/:id',
    {
      preHandler: requirePermission('messages', 'read'),
    },
    async (request, reply) => {
      const db = getClient();
      const link = await getRedirectLink(db, request.params.id);
      if (!link) return reply.status(404).send({ error: 'Link not found' });
      return reply.send(link);
    },
  );

  app.post<{
    Body: {
      campaignId: string;
      destinationUrl: string;
      utmSource?: string;
      utmMedium?: string;
      utmCampaign?: string;
      utmContent?: string;
      fbclid?: string;
      metaCampaignId?: string;
      metaAdsetId?: string;
      metaAdId?: string;
      creativeId?: string;
      placement?: string;
      maxUses?: number;
      expiresAt?: string;
    };
  }>(
    '/messaging/redirect-links',
    {
      preHandler: requirePermission('messages', 'create'),
    },
    async (request, reply) => {
      const db = getClient();
      const data = request.body;

      const link = await createRedirectLink(db, {
        ...data,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined,
        createdBy: request.user!.id,
      });

      await writeAuditLog(db, {
        userId: request.user!.id,
        action: 'create_redirect_link',
        resource: 'messages',
        resourceId: link.id,
        ipAddress: request.ip,
      });

      return reply.status(201).send(link);
    },
  );

  app.post<{
    Params: { id: string };
  }>(
    '/messaging/redirect-links/:id/deactivate',
    {
      preHandler: requirePermission('messages', 'update'),
    },
    async (request, reply) => {
      const db = getClient();
      const link = await deactivateRedirectLink(db, request.params.id);

      await writeAuditLog(db, {
        userId: request.user!.id,
        action: 'deactivate_redirect_link',
        resource: 'messages',
        resourceId: link.id,
        ipAddress: request.ip,
      });

      return reply.send(link);
    },
  );

  app.post<{
    Params: { id: string };
  }>(
    '/messaging/redirect-links/:id/activate',
    {
      preHandler: requirePermission('messages', 'update'),
    },
    async (request, reply) => {
      const db = getClient();
      const link = await activateRedirectLink(db, request.params.id);

      await writeAuditLog(db, {
        userId: request.user!.id,
        action: 'activate_redirect_link',
        resource: 'messages',
        resourceId: link.id,
        ipAddress: request.ip,
      });

      return reply.send(link);
    },
  );

  app.post<{
    Body: {
      contactId: string;
      campaignId: string;
      source: string;
      medium: string;
      confidence: 'high' | 'medium' | 'low';
    };
  }>(
    '/messaging/attributions',
    {
      preHandler: requirePermission('messages', 'create'),
    },
    async (request, reply) => {
      const db = getClient();
      const { contactId, campaignId, source, medium, confidence } = request.body;

      const participation = await attributeConversation(db, contactId, campaignId, {
        source,
        medium,
        campaignRef: '',
        landingUrl: '',
        confidence,
      });

      return reply.status(201).send(participation);
    },
  );

  app.post<{
    Params: { contactId: string };
  }>(
    '/messaging/contacts/:contactId/opt-out',
    {
      preHandler: requirePermission('contacts', 'update'),
    },
    async (request, reply) => {
      const db = getClient();
      const result = await optOutContact(db, request.params.contactId);

      await writeAuditLog(db, {
        userId: request.user!.id,
        action: 'opt_out_contact',
        resource: 'contacts',
        resourceId: request.params.contactId,
        ipAddress: request.ip,
      });

      return reply.send(result);
    },
  );

  app.post<{
    Params: { contactId: string };
  }>(
    '/messaging/contacts/:contactId/opt-in',
    {
      preHandler: requirePermission('contacts', 'update'),
    },
    async (request, reply) => {
      const db = getClient();
      const result = await optInContact(db, request.params.contactId);

      await writeAuditLog(db, {
        userId: request.user!.id,
        action: 'opt_in_contact',
        resource: 'contacts',
        resourceId: request.params.contactId,
        ipAddress: request.ip,
      });

      return reply.send(result);
    },
  );

  app.post<{
    Params: { conversationId: string };
    Body: {
      content: string;
      messageType?: 'text' | 'link' | 'interactive';
      idempotencyKey?: string;
    };
  }>(
    '/messaging/conversations/:conversationId/messages',
    {
      preHandler: requirePermission('messages', 'create'),
    },
    async (request, reply) => {
      const db = getClient();
      const content = request.body.content?.trim();
      if (!content || content.length > 4096) {
        return reply
          .status(400)
          .send({ error: 'Message content must contain 1 to 4096 characters' });
      }

      const conversation = await db.conversation.findUnique({
        where: { id: request.params.conversationId },
        include: {
          contact: {
            include: {
              preferences: {
                where: { channel: 'whatsapp', optedOut: true },
                take: 1,
              },
            },
          },
          participation: { select: { campaignId: true } },
        },
      });
      if (!conversation) return reply.status(404).send({ error: 'Conversation not found' });

      const idempotencyKey =
        request.body.idempotencyKey?.trim() || `manual:${conversation.id}:${crypto.randomUUID()}`;
      if (idempotencyKey.length > 200) {
        return reply.status(400).send({ error: 'Idempotency key is too long' });
      }

      const existing = await db.outboundRecord.findUnique({ where: { idempotencyKey } });
      if (existing) {
        return reply.status(202).send({
          outboundRecordId: existing.id,
          status: existing.status,
          duplicate: true,
        });
      }

      const provider = (process.env.WHATSAPP_PRIVATE_PROVIDER ?? 'mock').toLowerCase();
      const baseRecord = {
        idempotencyKey,
        conversationId: conversation.id,
        contactId: conversation.contactId,
        campaignId: conversation.participation?.campaignId ?? null,
        provider,
        attempts: 0,
      };

      if (conversation.status === 'handoff' || conversation.contact.preferences.length > 0) {
        const reason = conversation.status === 'handoff' ? 'human_handoff' : 'opted_out';
        const record = await db.outboundRecord.create({
          data: { ...baseRecord, status: 'skipped', lastError: reason },
        });
        return reply.status(409).send({ outboundRecordId: record.id, status: 'skipped' });
      }

      if (process.env.WHATSAPP_OUTBOUND_ENABLED !== 'true') {
        const record = await db.outboundRecord.create({
          data: { ...baseRecord, status: 'blocked', lastError: 'outbound_disabled' },
        });
        return reply.status(503).send({
          outboundRecordId: record.id,
          status: 'blocked',
          error: 'Outbound messaging is disabled',
        });
      }

      const lastInbound = await db.conversationMessage.findFirst({
        where: { conversationId: conversation.id, direction: 'inbound' },
        orderBy: { sentAt: 'desc' },
        select: { sentAt: true, senderPhoneNumberId: true },
      });
      if ((process.env.WHATSAPP_PRIVATE_PROVIDER ?? 'mock').toLowerCase() === 'meta_cloud') {
        if (!serviceWindowState(lastInbound?.sentAt ?? null).serviceWindowOpen) {
          const record = await db.outboundRecord.create({
            data: { ...baseRecord, status: 'blocked', lastError: 'service_window_closed' },
          });
          return reply.status(409).send({
            outboundRecordId: record.id,
            status: 'blocked',
            error: 'CUSTOMER_SERVICE_WINDOW_CLOSED',
            message:
              'A janela de atendimento está fechada. Inicie uma nova conversa com um template aprovado.',
          });
        }
      }

      const phone = conversation.contact.normalizedPhone ?? conversation.contact.phone ?? '';
      try {
        assertStagingRecipientAllowed(
          phone,
          process.env.DEPLOYMENT_ENV ?? 'development',
          process.env.WHATSAPP_STAGING_ALLOWLIST,
        );
      } catch (error) {
        const reason =
          error instanceof OutboundBlockedError ? error.code : 'INVALID_RECIPIENT_PHONE';
        const record = await db.outboundRecord.create({
          data: { ...baseRecord, status: 'blocked', lastError: reason },
        });
        return reply.status(403).send({ outboundRecordId: record.id, status: 'blocked' });
      }

      const record = await db.outboundRecord.create({
        data: { ...baseRecord, status: 'pending' },
      });

      try {
        const jobId = await enqueueOutboundMessage({
          conversationId: conversation.id,
          contactId: conversation.contactId,
          campaignId: conversation.participation?.campaignId,
          content,
          messageType: request.body.messageType ?? 'text',
          phoneNumberId: lastInbound?.senderPhoneNumberId ?? undefined,
          idempotencyKey,
        });
        return reply.status(202).send({
          outboundRecordId: record.id,
          jobId,
          status: 'pending',
          duplicate: false,
        });
      } catch (error) {
        await db.outboundRecord.update({
          where: { id: record.id },
          data: { status: 'failed', lastError: 'queue_unavailable' },
        });
        throw error;
      }
    },
  );
}

const CUSTOMER_SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

function serviceWindowState(lastInboundAt: Date | null) {
  const expiresAt = lastInboundAt
    ? new Date(lastInboundAt.getTime() + CUSTOMER_SERVICE_WINDOW_MS)
    : null;
  return {
    lastInboundAt,
    serviceWindowOpen: expiresAt !== null && expiresAt.getTime() > Date.now(),
    serviceWindowExpiresAt: expiresAt,
  };
}
