import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { getClient } from '@meteorico/database';
import { handleIncomingMessage, handleDeliveryStatus } from '../services/conversation.js';
import { processInboundCampaign } from '../services/campaign-runtime.js';
import { writeAuditLog } from '../services/audit.js';
import { getMockProvider } from '../providers/messaging-mock.js';
import { createMetaCloudProvider } from '../providers/messaging-provider.js';
import type { MessagingProvider, WebhookPayload } from '../providers/messaging.js';
import { handleFollowupDeliveryStatus, handleFollowupInbound } from '../services/followup.js';
import { applyMetaTemplateWebhook } from '../services/meta-template.js';

interface RawBodyRequest extends FastifyRequest {
  rawBody?: Buffer;
}

interface MetaVerificationQuery {
  'hub.mode'?: string;
  'hub.verify_token'?: string;
  'hub.challenge'?: string;
}

export async function webhookRoutes(app: FastifyInstance) {
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (request, body, done) => {
    const rawBody = Buffer.isBuffer(body) ? body : Buffer.from(body);
    (request as RawBodyRequest).rawBody = rawBody;
    try {
      done(null, JSON.parse(rawBody.toString('utf8')) as unknown);
    } catch (error) {
      done(error as Error, undefined);
    }
  });

  app.post(
    '/webhook/messaging',
    {
      config: {
        rateLimit: {
          max: 200,
          timeWindow: '1 minute',
        },
      },
    },
    async (request, reply) => {
      const provider = getMockProvider();
      const headers = normalizeHeaders(request.headers);
      const rawBody = (request as RawBodyRequest).rawBody ?? Buffer.from('');

      if (!provider.verifyWebhook(headers, rawBody)) {
        return reply.status(403).send({ error: 'Invalid webhook signature' });
      }

      const parsed = provider.parseWebhook(headers, request.body);
      const payloads = normalizePayloads(parsed);
      if (!payloads) {
        return reply.status(400).send({ error: 'Invalid webhook payload' });
      }

      const result = await processWebhookPayloads(provider, payloads);
      return reply.send({ ok: true, ...result });
    },
  );

  app.get<{ Querystring: MetaVerificationQuery }>(
    '/webhooks/whatsapp/meta',
    async (request, reply) => {
      const mode = request.query['hub.mode'];
      const verifyToken = request.query['hub.verify_token'];
      const challenge = request.query['hub.challenge'];
      const expectedToken = process.env.META_WHATSAPP_VERIFY_TOKEN ?? '';

      if (
        mode !== 'subscribe' ||
        !challenge ||
        !verifyToken ||
        !expectedToken ||
        !safeEqual(verifyToken, expectedToken)
      ) {
        return reply.status(403).send({ error: 'Webhook verification failed' });
      }

      return reply.type('text/plain').send(challenge);
    },
  );

  app.post(
    '/webhooks/whatsapp/meta',
    {
      config: {
        rateLimit: {
          max: 500,
          timeWindow: '1 minute',
        },
      },
    },
    async (request, reply) => {
      let provider: MessagingProvider;
      try {
        provider = createMetaCloudProvider();
      } catch {
        return reply.status(503).send({ error: 'Meta Cloud provider is not configured' });
      }

      const headers = normalizeHeaders(request.headers);
      const rawBody = (request as RawBodyRequest).rawBody;
      if (!rawBody || !provider.verifyWebhook(headers, rawBody)) {
        return reply.status(403).send({ error: 'Invalid webhook signature' });
      }

      const templateUpdates = await applyMetaTemplateWebhook(getClient(), request.body);
      const parsed = provider.parseWebhook(headers, request.body);
      const payloads = normalizePayloads(parsed);
      if (!payloads) {
        if (templateUpdates > 0) return reply.send({ ok: true, templateUpdates });
        return reply.status(400).send({ error: 'Invalid webhook payload' });
      }

      const result = await processWebhookPayloads(provider, payloads);
      return reply.send({ ok: true, templateUpdates, ...result });
    },
  );
}

async function processWebhookPayloads(
  provider: MessagingProvider,
  payloads: WebhookPayload[],
): Promise<{
  processed: number;
  duplicates: number;
  conversationId?: string;
  isNew: boolean;
  conversationIds: string[];
  classifications: string[];
  outboundQueued: number;
  outboundDuplicates: number;
}> {
  const db = getClient();
  let processed = 0;
  let duplicates = 0;
  const conversationIds: string[] = [];
  const classifications: string[] = [];
  let outboundQueued = 0;
  let outboundDuplicates = 0;
  let isNew = false;

  for (const payload of payloads) {
    if (payload.type === 'message' && payload.message) {
      const externalEventId = payload.message.externalMessageId;
      const claimed = await claimEvent(provider.name, externalEventId, 'message');
      if (!claimed) {
        duplicates += 1;
        continue;
      }

      try {
        const messageResult = await handleIncomingMessage(db, payload.message, provider);
        const followupInbound = await handleFollowupInbound(db, {
          contactId: messageResult.contactId,
          content: payload.message.content,
          receivedAt: payload.message.timestamp,
        });
        if (followupInbound.campaignId) {
          await notifyN8n(process.env.N8N_INBOUND_WEBHOOK_URL, {
            campaign_id: followupInbound.campaignId,
            opt_out: followupInbound.isOptOut,
          });
        }
        conversationIds.push(messageResult.conversationId);
        isNew = isNew || messageResult.isNew;

        await writeAuditLog(db, {
          action: 'inbound.received',
          resource: 'conversations',
          resourceId: messageResult.conversationId,
          newValue: {
            contactId: messageResult.contactId,
            provider: provider.name,
            messageType: payload.message.messageType,
          },
        });

        const runtime = await processInboundCampaign(db, {
          contactId: messageResult.contactId,
          conversationId: messageResult.conversationId,
        });
        if (runtime.classification) classifications.push(runtime.classification);
        if (runtime.outboundQueued) outboundQueued += 1;
        if (runtime.duplicateOutbound) outboundDuplicates += 1;

        await completeClaim(provider.name, externalEventId);
        processed += 1;
      } catch (error) {
        await releaseClaim(provider.name, externalEventId);
        throw error;
      }
      continue;
    }

    if (payload.type === 'status' && payload.status) {
      const externalEventId = `${payload.status.externalMessageId}:${payload.status.status}`;
      const eventType = `status:${payload.status.status}`;
      const claimed = await claimEvent(provider.name, externalEventId, eventType);
      if (!claimed) {
        duplicates += 1;
        continue;
      }

      try {
        await handleDeliveryStatus(db, payload.status);
        const followupStatus = await handleFollowupDeliveryStatus(db, payload.status);
        if (followupStatus) {
          await notifyN8n(process.env.N8N_STATUS_WEBHOOK_URL, {
            campaign_id: followupStatus.campaignId,
            status: followupStatus.status,
          });
        }
        await completeClaim(provider.name, externalEventId);
        processed += 1;
      } catch (error) {
        await releaseClaim(provider.name, externalEventId);
        throw error;
      }
    }
  }

  return {
    processed,
    duplicates,
    conversationId: conversationIds[0],
    isNew,
    conversationIds,
    classifications,
    outboundQueued,
    outboundDuplicates,
  };

  async function claimEvent(
    eventSource: string,
    externalEventId: string,
    eventType: string,
  ): Promise<boolean> {
    const result = await db.processedEvent.createMany({
      data: [{ eventSource, externalEventId, eventType, result: 'processing' }],
      skipDuplicates: true,
    });
    return result.count === 1;
  }

  async function completeClaim(eventSource: string, externalEventId: string): Promise<void> {
    await db.processedEvent.update({
      where: { eventSource_externalEventId: { eventSource, externalEventId } },
      data: { result: 'processed' },
    });
  }

  async function releaseClaim(eventSource: string, externalEventId: string): Promise<void> {
    await db.processedEvent.deleteMany({
      where: { eventSource, externalEventId, result: 'processing' },
    });
  }
}

function normalizeHeaders(rawHeaders: FastifyRequest['headers']): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(rawHeaders)) {
    if (typeof value === 'string') headers[key.toLowerCase()] = value;
    else if (Array.isArray(value) && value[0]) headers[key.toLowerCase()] = value[0];
  }
  return headers;
}

function normalizePayloads(
  parsed: WebhookPayload | WebhookPayload[] | null,
): WebhookPayload[] | null {
  if (!parsed) return null;
  return Array.isArray(parsed) ? parsed : [parsed];
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

async function notifyN8n(url: string | undefined, body: Record<string, unknown>): Promise<void> {
  if (!url || !process.env.N8N_INTERNAL_TOKEN) return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Token': process.env.N8N_INTERNAL_TOKEN,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // O webhook oficial já foi persistido; falha de observabilidade do n8n não deve pedir retry à Meta.
  }
}
