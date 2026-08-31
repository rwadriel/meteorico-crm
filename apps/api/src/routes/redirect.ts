import type { FastifyInstance } from 'fastify';
import { getClient } from '@meteorico/database';
import { resolveRedirectLink } from '../services/redirect.js';
import { recordFollowupClick } from '../services/followup.js';

export async function redirectRoutes(app: FastifyInstance) {
  app.get<{ Params: { code: string } }>(
    '/t/:code',
    {
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const { code } = request.params;
      if (!/^[a-zA-Z0-9_-]{12,32}$/.test(code)) {
        return reply.status(400).send({ error: 'Invalid code' });
      }
      const destination = await recordFollowupClick(getClient(), code, {
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'] ?? '',
        referer: request.headers['referer'] ?? '',
      });
      if (!destination) return reply.status(404).send({ error: 'Link not found' });
      return reply.redirect(destination);
    },
  );

  app.get<{
    Params: { code: string };
  }>('/r/:code', {
    config: {
      rateLimit: {
        max: 30,
        timeWindow: '1 minute',
      },
    },
  }, async (request, reply) => {
    const { code } = request.params;

    if (!/^[a-zA-Z0-9_-]{4,16}$/.test(code)) {
      return reply.status(400).send({ error: 'Invalid code' });
    }

    const db = getClient();
    const result = await resolveRedirectLink(db, code, {
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] ?? '',
      referer: request.headers['referer'] ?? '',
    });

    if (!result) {
      return reply.status(404).send({ error: 'Link not found or expired' });
    }

    return reply.redirect(result.url);
  });
}
