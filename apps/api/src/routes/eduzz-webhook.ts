import type { FastifyInstance } from 'fastify';
import { getClient } from '@meteorico/database';
import { handleEduzzWebhook, createEduzzProvider } from '../services/eduzz.js';
import type { EduzzWebhookPayload } from '../services/eduzz.js';

export async function eduzzWebhookRoutes(app: FastifyInstance) {
  app.post<{ Body: EduzzWebhookPayload }>('/webhook/eduzz', {
    config: {
      rateLimit: {
        max: 200,
        timeWindow: '1 minute',
      },
    },
  }, async (request, reply) => {
    const db = getClient();

    let provider;
    try {
      provider = createEduzzProvider();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Provider unavailable';
      request.log.error({ err: message }, 'Eduzz provider not configured');
      return reply.status(503).send({ error: 'Webhook provider not configured' });
    }

    try {
      const result = await handleEduzzWebhook(db, provider, request.body);
      return reply.send(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (message === 'Invalid signature') {
        return reply.status(401).send({ error: 'Invalid signature' });
      }
      return reply.status(500).send({ error: message });
    }
  });
}
