import type { FastifyInstance } from 'fastify';
import { getClient } from '@meteorico/database';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { createRedirectLink, listRedirectLinks, deactivateRedirectLink } from '../services/redirect.js';
import { optOutContact, optInContact, attributeConversation } from '../services/conversation.js';
import { writeAuditLog } from '../services/audit.js';

export async function messagingRoutes(app: FastifyInstance) {
  app.addHook('onRequest', requireAuth);

  app.get('/messaging/redirect-links', {
    preHandler: requirePermission('messages', 'read'),
  }, async (request, reply) => {
    const db = getClient();
    const { campaignId } = request.query as { campaignId?: string };
    const links = await listRedirectLinks(db, campaignId);
    return reply.send({ links });
  });

  app.post<{
    Body: {
      campaignId: string;
      destinationUrl: string;
      utmSource?: string;
      utmMedium?: string;
      utmCampaign?: string;
      utmContent?: string;
      fbclid?: string;
      maxUses?: number;
      expiresAt?: string;
    };
  }>('/messaging/redirect-links', {
    preHandler: requirePermission('messages', 'create'),
  }, async (request, reply) => {
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
  });

  app.post<{
    Params: { id: string };
  }>('/messaging/redirect-links/:id/deactivate', {
    preHandler: requirePermission('messages', 'update'),
  }, async (request, reply) => {
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
  });

  app.post<{
    Body: { contactId: string; campaignId: string; source: string; medium: string; confidence: 'high' | 'medium' | 'low' };
  }>('/messaging/attributions', {
    preHandler: requirePermission('messages', 'create'),
  }, async (request, reply) => {
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
  });

  app.post<{
    Params: { contactId: string };
  }>('/messaging/contacts/:contactId/opt-out', {
    preHandler: requirePermission('contacts', 'update'),
  }, async (request, reply) => {
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
  });

  app.post<{
    Params: { contactId: string };
  }>('/messaging/contacts/:contactId/opt-in', {
    preHandler: requirePermission('contacts', 'update'),
  }, async (request, reply) => {
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
  });
}
