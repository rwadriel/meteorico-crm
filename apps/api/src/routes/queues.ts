import type { FastifyInstance } from 'fastify';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { getOutboundMessageQueue, getIntegrationTaskQueue } from '../queues/index.js';

export async function queueRoutes(app: FastifyInstance) {
  app.addHook('onRequest', requireAuth);

  app.get('/queues/status', {
    preHandler: requirePermission('settings', 'read'),
  }, async () => {
    const [outbound, integration] = await Promise.all([
      getQueueCounts(getOutboundMessageQueue()),
      getQueueCounts(getIntegrationTaskQueue()),
    ]);

    return {
      queues: {
        'outbound-messages': outbound,
        'integration-tasks': integration,
      },
      timestamp: new Date().toISOString(),
    };
  });
}

async function getQueueCounts(queue: { getJobCounts: () => Promise<Record<string, number>> }) {
  try {
    return await queue.getJobCounts();
  } catch {
    return { error: 'unavailable' };
  }
}
