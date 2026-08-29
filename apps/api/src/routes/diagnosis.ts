import type { FastifyInstance } from 'fastify';
import { getClient } from '@meteorico/database';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { runDiagnosis, persistDiagnosis, listDiagnoses } from '../services/diagnosis.js';
import { XaiProvider, MockAiProvider } from '../providers/ai-xai.js';
import { writeAuditLog } from '../services/audit.js';

function getAiProvider() {
  if (process.env.XAI_API_KEY) {
    return new XaiProvider();
  }
  return new MockAiProvider();
}

export async function diagnosisRoutes(app: FastifyInstance) {
  app.addHook('onRequest', requireAuth);

  app.post<{
    Body: {
      contactId: string;
      participationId: string;
      campaignId: string;
    };
  }>('/diagnosis/run', {
    preHandler: requirePermission('contacts', 'update'),
  }, async (request, reply) => {
    const db = getClient();
    const { contactId, participationId, campaignId } = request.body;

    const contact = await db.contact.findUnique({ where: { id: contactId } });
    if (!contact) return reply.status(404).send({ error: 'Contact not found' });

    const participation = await db.campaignParticipation.findUnique({
      where: { id: participationId },
    });
    if (!participation) return reply.status(404).send({ error: 'Participation not found' });

    const messages = await db.conversationMessage.findMany({
      where: {
        conversation: { contactId },
      },
      orderBy: { sentAt: 'desc' },
      take: 10,
      select: { content: true, direction: true },
    });

    const conversationHistory = messages
      .reverse()
      .map((m) => `[${m.direction}] ${m.content}`);

    const aiProvider = getAiProvider();

    const input = {
      contactId,
      participationId,
      campaignId,
      contactSummary: {
        name: contact.name,
        classification: participation.classification,
        totalParticipations: contact.totalParticipations,
        isStudent: contact.isStudent,
      },
      conversationHistory,
    };

    try {
      const result = await runDiagnosis(db, aiProvider, input);

      await persistDiagnosis(db, input, result, aiProvider.name);

      await writeAuditLog(db, {
        userId: request.user!.id,
        action: 'run_diagnosis',
        resource: 'contacts',
        resourceId: contactId,
        newValue: { tokensUsed: result.tokensUsed, promptHash: result.promptHash },
        ipAddress: request.ip,
      });

      return reply.send(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return reply.status(400).send({ error: message });
    }
  });

  app.get<{
    Querystring: { contactId?: string; participationId?: string };
  }>('/diagnosis', {
    preHandler: requirePermission('contacts', 'read'),
  }, async (request, reply) => {
    const db = getClient();
    const { contactId, participationId } = request.query;
    const diagnoses = await listDiagnoses(db, { contactId, participationId });
    return reply.send(diagnoses);
  });

  app.post<{
    Body: {
      classification: string;
      totalParticipations: number;
      isStudent: boolean;
      conversationHistory: string[];
    };
  }>('/diagnosis/playground', {
    preHandler: requirePermission('contacts', 'read'),
  }, async (request, reply) => {
    const db = getClient();
    const { classification, totalParticipations, isStudent, conversationHistory } = request.body;

    const aiProvider = getAiProvider();

    if (totalParticipations < 3) {
      return reply.status(400).send({ error: 'Playground requires totalParticipations >= 3' });
    }

    try {
      const result = await runDiagnosis(db, aiProvider, {
        contactId: 'playground',
        participationId: 'playground',
        campaignId: 'playground',
        contactSummary: {
          name: 'Contato Teste',
          classification,
          totalParticipations,
          isStudent,
        },
        conversationHistory,
      }, { maxTokensPerRequest: 1000 });

      return reply.send({
        diagnosis: result.diagnosis,
        recommendations: result.recommendations,
        suggestedObjection: result.suggestedObjection,
        tokensUsed: result.tokensUsed,
        latencyMs: result.latencyMs,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return reply.status(400).send({ error: message });
    }
  });
}
