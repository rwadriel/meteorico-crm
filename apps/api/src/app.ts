import Fastify, { type FastifyInstance, type FastifyError } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { healthRoutes } from './routes/health.js';
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

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Meteorico CRM API',
        version: '0.1.0',
        description: 'API do sistema Meteorico CRM',
      },
    },
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
  });

  await app.register(healthRoutes);

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
