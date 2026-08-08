import './types.js';
import Fastify, { type FastifyInstance, type FastifyError } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import multipart from '@fastify/multipart';
import { healthRoutes } from './routes/health.js';
import { authRoutes } from './routes/auth.js';
import { campaignRoutes } from './routes/campaigns.js';
import { groupRoutes } from './routes/groups.js';
import { importRoutes } from './routes/imports.js';
import { integrationRoutes } from './routes/integration.js';
import { createLogger } from './logger.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: createLogger(),
    genReqId: () => crypto.randomUUID(),
  });

  await app.register(cors, {
    origin: (process.env.API_CORS_ORIGINS ?? 'http://localhost:5173').split(','),
    credentials: true,
  });

  await app.register(helmet, {
    contentSecurityPolicy: false,
  });

  await app.register(cookie);

  await app.register(rateLimit, {
    global: true,
    max: 100,
    timeWindow: '1 minute',
  });

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Meteorico CRM API',
        version: '0.2.0',
        description: 'API do sistema Meteorico CRM',
      },
    },
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
  });

  await app.register(multipart, {
    limits: {
      fileSize: 10 * 1024 * 1024,
    },
  });

  await app.register(healthRoutes);

  await app.register(authRoutes, {
    config: {
      rateLimit: {
        max: 5,
        timeWindow: '15 minutes',
      },
    },
  });

  await app.register(campaignRoutes, { prefix: '/api' });
  await app.register(groupRoutes, { prefix: '/api' });
  await app.register(importRoutes, { prefix: '/api' });
  await app.register(integrationRoutes, { prefix: '/api' });

  app.setErrorHandler((error: FastifyError, _request, reply) => {
    app.log.error(error, 'Unhandled error');
    const statusCode = error.statusCode ?? 500;
    reply.status(statusCode).send({
      error: error.name,
      message: statusCode >= 500 ? 'Internal server error' : error.message,
      code: error.code ?? 'INTERNAL_ERROR',
    });
  });

  return app;
}
