import type { FastifyInstance } from 'fastify';
import { getClient } from '@meteorico/database';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import {
  classifyContact,
  simulateClassification,
  overrideClassification,
  type ContactClassification,
} from '../services/classification.js';
import { writeAuditLog } from '../services/audit.js';

const VALID_CLASSIFICATIONS = new Set(['aluno', 'novo', 'reparticipante', 'veterano']);

export async function classificationRoutes(app: FastifyInstance) {
  app.addHook('onRequest', requireAuth);

  app.post<{
    Body: { contactId: string; campaignId: string };
  }>('/classification/classify', {
    preHandler: requirePermission('contacts', 'update'),
  }, async (request, reply) => {
    const db = getClient();
    const { contactId, campaignId } = request.body;

    const result = await classifyContact(db, contactId, campaignId);

    await writeAuditLog(db, {
      userId: request.user!.id,
      action: 'classify_contact',
      resource: 'contacts',
      resourceId: contactId,
      newValue: { classification: result.classification, campaignId },
      ipAddress: request.ip,
    });

    return reply.send(result);
  });

  app.post<{
    Body: { contactId: string; campaignId: string };
  }>('/classification/simulate', {
    preHandler: requirePermission('contacts', 'read'),
  }, async (request, reply) => {
    const db = getClient();
    const { contactId, campaignId } = request.body;

    const result = await simulateClassification(db, contactId, campaignId);
    return reply.send(result);
  });

  app.post<{
    Body: { contactId: string; campaignId: string; classification: string };
  }>('/classification/override', {
    preHandler: requirePermission('contacts', 'update'),
  }, async (request, reply) => {
    const db = getClient();
    const { contactId, campaignId, classification } = request.body;

    if (!VALID_CLASSIFICATIONS.has(classification)) {
      return reply.status(400).send({ error: 'Invalid classification' });
    }

    const result = await overrideClassification(
      db,
      contactId,
      campaignId,
      classification as ContactClassification,
      request.user!.id,
    );

    await writeAuditLog(db, {
      userId: request.user!.id,
      action: 'override_classification',
      resource: 'contacts',
      resourceId: contactId,
      newValue: { classification, campaignId },
      ipAddress: request.ip,
    });

    return reply.send(result);
  });
}
