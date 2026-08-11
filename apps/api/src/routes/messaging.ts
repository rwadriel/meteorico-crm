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
