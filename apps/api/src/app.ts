import './types.js';
import Fastify, { type FastifyInstance, type FastifyError } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import multipart from '@fastify/multipart';
import { assertRuntimeConfig } from '@meteorico/shared';
import { healthRoutes } from './routes/health.js';
import { authRoutes } from './routes/auth.js';
import { campaignRoutes } from './routes/campaigns.js';
import { groupRoutes } from './routes/groups.js';
import { importRoutes } from './routes/imports.js';
import { integrationRoutes } from './routes/integration.js';
import { redirectRoutes } from './routes/redirect.js';
import { webhookRoutes } from './routes/webhook.js';
import { messagingRoutes } from './routes/messaging.js';
import { classificationRoutes } from './routes/classification.js';
import { templateRoutes } from './routes/templates.js';
import { flowRoutes } from './routes/flows.js';
import { knowledgeRoutes } from './routes/knowledge.js';
import { diagnosisRoutes } from './routes/diagnosis.js';
import { handoffRoutes } from './routes/handoff.js';
import { analyticsRoutes } from './routes/analytics.js';
import { eduzzWebhookRoutes } from './routes/eduzz-webhook.js';
import { queueRoutes } from './routes/queues.js';
import { contactRoutes } from './routes/contacts.js';
import { contactListRoutes } from './routes/contact-lists.js';
import { auditRoutes } from './routes/audit-logs.js';
import { settingsRoutes } from './routes/settings.js';
import { metaVerifyRoutes } from './routes/meta-verify.js';
import { followupRoutes } from './routes/followup.js';
import { csrfProtection } from './middleware/csrf.js';
import { createLogger } from './logger.js';

const isProduction = (process.env.NODE_ENV ?? 'development') === 'production';

export async function buildApp(): Promise<FastifyInstance> {
  assertRuntimeConfig('api');

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

  await csrfProtection(app);

  await app.register(rateLimit, {
    global: true,
    max: 100,
    timeWindow: '1 minute',
  });

  if (!isProduction) {
    await app.register(swagger, {
      openapi: {
        info: {
          title: 'Meteorico CRM API',
          version: '0.3.0',
          description: 'API do sistema Meteorico CRM',
        },
      },
    });

    await app.register(swaggerUi, {
      routePrefix: '/docs',
    });
  }

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

  await app.register(campaignRoutes);
  await app.register(groupRoutes);
  await app.register(contactRoutes);
  await app.register(contactListRoutes);
  await app.register(importRoutes);
  await app.register(integrationRoutes);
  await app.register(messagingRoutes);
  await app.register(classificationRoutes);
  await app.register(templateRoutes);
  await app.register(flowRoutes);
  await app.register(knowledgeRoutes);
  await app.register(diagnosisRoutes);
  await app.register(handoffRoutes);
  await app.register(analyticsRoutes);
  await app.register(queueRoutes);
  await app.register(auditRoutes);
  await app.register(settingsRoutes);
  await app.register(metaVerifyRoutes);
  await app.register(followupRoutes);
  await app.register(redirectRoutes);
  await app.register(webhookRoutes);
  await app.register(eduzzWebhookRoutes);

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
