import type { FastifyInstance } from 'fastify';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { getMessagingProvider } from '../providers/messaging-provider.js';
import type { MetaCloudWhatsAppProvider } from '@meteorico/shared';

export async function metaVerifyRoutes(app: FastifyInstance) {
  app.addHook('onRequest', requireAuth);

  app.get('/meta/verify', {
    preHandler: requirePermission('integration', 'read'),
    schema: {
      tags: ['System'],
      summary: 'Read-only Meta Graph API access verification',
    },
  }, async (_request, reply) => {
    const provider = getMessagingProvider();
    if (provider.name !== 'meta_cloud') {
      return reply.status(200).send({
        provider: provider.name,
        authenticated: false,
        phoneNumber: null,
        waba: null,
        error: 'Provider is not meta_cloud',
      });
    }

    const meta = provider as MetaCloudWhatsAppProvider;
    const result = await meta.verifyAccess();
    return reply.status(result.authenticated ? 200 : 503).send(result);
  });
}
