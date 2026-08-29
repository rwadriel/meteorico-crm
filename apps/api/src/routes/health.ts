import type { FastifyInstance } from 'fastify';
import { getClient } from '@meteorico/database';
import { validateRuntimeConfig } from '@meteorico/shared';
import { getRedisConnection } from '../queues/connection.js';
import { getIntegrationHealth } from '../services/integration.js';

type DependencyStatus = 'ok' | 'error';

interface ReadinessDependencies {
  database: () => Promise<void>;
  redis: () => Promise<void>;
  groupManager: () => Promise<{ status: string; connected: boolean | null; snapshotFresh: boolean }>;
}

export async function getReadinessStatus(
  dependencies: ReadinessDependencies = defaultDependencies(),
) {
  const [database, redis] = await Promise.all([
    dependencyStatus(dependencies.database),
    dependencyStatus(dependencies.redis),
  ]);
  const provider = (process.env.WHATSAPP_PRIVATE_PROVIDER ?? 'mock').toLowerCase();
  const metaValidation = validateRuntimeConfig('api');
  const groupManager = database === 'ok'
    ? await dependencies.groupManager().catch(() => ({
        status: 'error',
        connected: null,
        snapshotFresh: false,
      }))
    : { status: 'error', connected: null, snapshotFresh: false };

  return {
    ready: database === 'ok' && redis === 'ok',
    checks: { database, redis },
    integrations: {
      meta: {
        provider,
        configured: provider === 'meta_cloud' && metaValidation.valid,
        outboundEnabled: process.env.WHATSAPP_OUTBOUND_ENABLED === 'true',
      },
      groupManager,
    },
  };
}

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', {
    schema: {
      tags: ['System'],
      summary: 'Liveness check',
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
  }, async () => ({
    status: 'healthy',
    service: 'meteorico-crm-api',
    version: '0.1.0',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  }));

  app.get('/readiness', {
    schema: {
      tags: ['System'],
      summary: 'Dependency and integration readiness check',
    },
  }, async (_request, reply) => {
    const result = await getReadinessStatus();
    return reply.status(result.ready ? 200 : 503).send(result);
  });
}

function defaultDependencies(): ReadinessDependencies {
  return {
    database: async () => {
      await getClient().$queryRaw`SELECT 1`;
    },
    redis: async () => {
      const response = await getRedisConnection().ping();
      if (response !== 'PONG') throw new Error('Redis ping failed');
    },
    groupManager: async () => {
      const health = await getIntegrationHealth(getClient(), 'whatsapp-manager');
      return {
        status: health.status,
        connected: health.connected,
        snapshotFresh: health.snapshotFresh,
      };
    },
  };
}

async function dependencyStatus(operation: () => Promise<void>): Promise<DependencyStatus> {
  try {
    await operation();
    return 'ok';
  } catch {
    return 'error';
  }
}
