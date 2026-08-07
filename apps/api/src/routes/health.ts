import type { FastifyInstance } from 'fastify';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', {
    schema: {
      tags: ['System'],
      summary: 'Health check',
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            service: { type: 'string' },
            version: { type: 'string' },
            timestamp: { type: 'string' },
            uptime: { type: 'number' },
          },
        },
      },
    },
  }, async (_request, _reply) => {
    return {
      status: 'healthy',
      service: 'meteorico-crm-api',
      version: '0.1.0',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  });

  app.get('/readiness', {
    schema: {
      tags: ['System'],
      summary: 'Readiness check',
      response: {
        200: {
          type: 'object',
          properties: {
            ready: { type: 'boolean' },
            checks: { type: 'object' },
          },
        },
      },
    },
  }, async (_request, _reply) => {
    return {
      ready: true,
      checks: {
        database: 'not_configured',
        redis: 'not_configured',
      },
    };
  });
}
