import type { FastifyInstance } from 'fastify';
import { getClient } from '@meteorico/database';
import { handleIncomingMessage, handleDeliveryStatus } from '../services/conversation.js';
import { getMockProvider } from '../providers/messaging-mock.js';

export async function webhookRoutes(app: FastifyInstance) {
  app.post('/webhook/messaging', {
    config: {
      rateLimit: {
        max: 200,
        timeWindow: '1 minute',
      },
    },
  }, async (request, reply) => {
    const provider = getMockProvider();
    const headers: Record<string, string> = {};
    for (const [key, val] of Object.entries(request.headers)) {
      if (typeof val === 'string') headers[key] = val;
    }

    if (!provider.verifyWebhook(headers, request.body)) {
      return reply.status(403).send({ error: 'Invalid webhook signature' });
    }

    const payload = provider.parseWebhook(headers, request.body);
    if (!payload) {
      return reply.status(400).send({ error: 'Invalid webhook payload' });
    }

    const db = getClient();

    if (payload.type === 'message' && payload.message) {
      const result = await handleIncomingMessage(db, payload.message, provider);
      return reply.send({ ok: true, conversationId: result.conversationId, isNew: result.isNew });
    }

    if (payload.type === 'status' && payload.status) {
      await handleDeliveryStatus(db, payload.status);
      return reply.send({ ok: true });
    }

    return reply.status(400).send({ error: 'Unknown webhook type' });
  });
}
