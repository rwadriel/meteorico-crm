import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { getClient } from '@meteorico/database';
import { z } from 'zod';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { writeAuditLog } from '../services/audit.js';
import {
  FOLLOWUP_TEMPLATES,
  getAudienceStats,
  prepareFollowupCampaign,
  processFollowupBatch,
  refreshFollowupCampaignMetrics,
  validateFollowupCampaignInput,
} from '../services/followup.js';

const createSchema = z.object({
  name: z.string().trim().min(1).max(160),
  templateName: z.string().trim().min(1).max(100),
  offerUrl: z.string().trim().max(2048).optional().nullable(),
});

const batchSchema = z.object({ batchSize: z.coerce.number().int().min(1).max(25).default(10) });
const listSchema = z.object({ page: z.coerce.number().int().positive().default(1), limit: z.coerce.number().int().min(1).max(100).default(20) });

export async function followupRoutes(app: FastifyInstance) {
  const db = getClient();
  const read = [requireAuth, requirePermission('campaigns', 'read')];
  const create = [requireAuth, requirePermission('campaigns', 'create')];
  const update = [requireAuth, requirePermission('campaigns', 'update')];

  app.get('/followup/templates', { preHandler: read }, async () => {
    const approvedNames = new Set(
      (process.env.META_APPROVED_TEMPLATE_NAMES ?? '')
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean),
    );
    return {
      templates: FOLLOWUP_TEMPLATES.map((template) => ({
        ...template,
        status: approvedNames.has(template.name) ? 'approved' : 'pending',
      })),
    };
  });

  app.get('/followup/audience', { preHandler: read }, async () => getAudienceStats(db));

  app.get('/followup/system-status', { preHandler: read }, async () => {
    const approvedTemplates = (process.env.META_APPROVED_TEMPLATE_NAMES ?? '')
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean);
    return {
      provider: process.env.WHATSAPP_PRIVATE_PROVIDER ?? 'mock',
      outboundEnabled: process.env.WHATSAPP_OUTBOUND_ENABLED === 'true',
      graphVersion: process.env.META_GRAPH_API_VERSION ?? 'v25.0',
      metaConfigured: Boolean(
        process.env.META_WHATSAPP_ACCESS_TOKEN
        && process.env.META_WHATSAPP_PHONE_NUMBER_ID
        && process.env.META_WHATSAPP_WABA_ID
        && process.env.META_WHATSAPP_VERIFY_TOKEN
        && process.env.META_APP_SECRET,
      ),
      n8nConfigured: Boolean(process.env.N8N_CAMPAIGN_WEBHOOK_URL && process.env.N8N_INTERNAL_TOKEN),
      approvedTemplates: FOLLOWUP_TEMPLATES.filter((template) => approvedTemplates.includes(template.name)).length,
      requiredTemplates: FOLLOWUP_TEMPLATES.length,
    };
  });

  app.get('/followup/campaigns', { preHandler: read }, async (request) => {
    const query = listSchema.parse(request.query);
    const [campaigns, total] = await Promise.all([
      db.followupCampaign.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      db.followupCampaign.count(),
    ]);
    return { campaigns, total, page: query.page, limit: query.limit };
  });

  app.get('/followup/campaigns/:id', { preHandler: read }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const campaign = await db.followupCampaign.findUnique({
      where: { id },
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 100,
          include: { contact: { select: { normalizedPhone: true, name: true } } },
        },
      },
    });
    if (!campaign) return reply.status(404).send({ message: 'Campanha não encontrada' });
    return {
      ...campaign,
      messages: campaign.messages.map((message) => ({
        ...message,
        contact: {
          name: message.contact.name,
          phone: maskPhone(message.contact.normalizedPhone),
        },
      })),
    };
  });

  app.post('/followup/campaigns', { preHandler: create }, async (request, reply) => {
    const input = createSchema.parse(request.body);
    validateFollowupCampaignInput(input);
    const campaign = await db.followupCampaign.create({
      data: {
        name: input.name,
        templateName: input.templateName,
        templateLanguage: 'pt_BR',
        offerUrl: input.offerUrl || null,
        createdBy: request.user!.id,
      },
    });
    await writeAuditLog(db, {
      userId: request.user!.id,
      action: 'followup_campaign.create',
      resource: 'followup_campaigns',
      resourceId: campaign.id,
      newValue: { name: campaign.name, templateName: campaign.templateName },
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] ?? '',
    });
    return reply.status(201).send(campaign);
  });

  app.post('/followup/campaigns/:id/dry-run', { preHandler: update }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const campaign = await db.followupCampaign.findUnique({ where: { id } });
    if (!campaign) return reply.status(404).send({ message: 'Campanha não encontrada' });
    validateFollowupCampaignInput(campaign);
    const audience = await getAudienceStats(db);
    await db.followupCampaign.update({
      where: { id },
      data: { totalContacts: audience.total, eligibleContacts: audience.eligible, status: 'ready' },
    });
    return { mode: 'dry_run', sent: 0, audience, template: campaign.templateName, offerUrl: campaign.offerUrl };
  });

  app.post('/followup/campaigns/:id/start', { preHandler: update }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const current = await db.followupCampaign.findUnique({ where: { id } });
    if (!current) return reply.status(404).send({ message: 'Campanha não encontrada' });
    if (!['draft', 'ready'].includes(current.status)) {
      return reply.status(409).send({ message: 'A campanha não pode ser iniciada neste estado' });
    }
    if (process.env.WHATSAPP_OUTBOUND_ENABLED !== 'true') {
      return reply.status(409).send({ message: 'Envio real está desativado. Use o Modo Teste.' });
    }
    if (!process.env.N8N_CAMPAIGN_WEBHOOK_URL || !process.env.N8N_INTERNAL_TOKEN) {
      return reply.status(503).send({ message: 'Orquestração n8n ainda não está configurada' });
    }

    const prepared = await prepareFollowupCampaign(db, id);
    if (prepared.eligibleContacts === 0) {
      return reply.status(409).send({ message: 'Nenhum contato elegível para esta campanha' });
    }
    const running = await db.followupCampaign.update({
      where: { id },
      data: { status: 'running', startedAt: new Date(), finishedAt: null },
    });

    try {
      await triggerN8n(id);
    } catch {
      await db.followupCampaign.update({ where: { id }, data: { status: 'ready' } });
      return reply.status(502).send({ message: 'O n8n não aceitou o início da campanha' });
    }

    await writeAuditLog(db, {
      userId: request.user!.id,
      action: 'followup_campaign.start',
      resource: 'followup_campaigns',
      resourceId: id,
      newValue: { eligibleContacts: running.eligibleContacts },
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] ?? '',
    });
    return running;
  });

  app.post('/followup/campaigns/:id/pause', { preHandler: update }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const updated = await db.followupCampaign.updateMany({
      where: { id, status: 'running' },
      data: { status: 'paused' },
    });
    if (updated.count !== 1) return reply.status(409).send({ message: 'A campanha não está em execução' });
    return db.followupCampaign.findUnique({ where: { id } });
  });

  app.post('/followup/campaigns/:id/resume', { preHandler: update }, async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!process.env.N8N_CAMPAIGN_WEBHOOK_URL || !process.env.N8N_INTERNAL_TOKEN) {
      return reply.status(503).send({ message: 'Orquestração n8n ainda não está configurada' });
    }
    const updated = await db.followupCampaign.updateMany({
      where: { id, status: 'paused' },
      data: { status: 'running' },
    });
    if (updated.count !== 1) return reply.status(409).send({ message: 'A campanha não está pausada' });
    try {
      await triggerN8n(id);
    } catch {
      await db.followupCampaign.update({ where: { id }, data: { status: 'paused' } });
      return reply.status(502).send({ message: 'O n8n não aceitou a retomada' });
    }
    return db.followupCampaign.findUnique({ where: { id } });
  });

  app.get('/followup/campaigns/:id/export.csv', { preHandler: read }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const messages = await db.followupCampaignMessage.findMany({
      where: { campaignId: id },
      orderBy: { createdAt: 'asc' },
      include: { contact: { select: { normalizedPhone: true } } },
    });
    const rows = ['telefone,status,enviado_em,entregue_em,lido_em,respondeu,erro'];
    for (const message of messages) {
      rows.push([
        csvCell(message.contact.normalizedPhone ?? ''),
        csvCell(message.status),
        csvCell(message.submittedAt?.toISOString() ?? ''),
        csvCell(message.deliveredAt?.toISOString() ?? ''),
        csvCell(message.readAt?.toISOString() ?? ''),
        message.repliedAt ? 'sim' : 'nao',
        csvCell(message.errorCode ?? ''),
      ].join(','));
    }
    return reply
      .type('text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="campanha-${id}.csv"`)
      .send(`\uFEFF${rows.join('\n')}`);
  });

  app.post('/internal/followup/campaigns/:id/process-batch', async (request, reply) => {
    if (!verifyInternalToken(request)) return reply.status(403).send({ message: 'Forbidden' });
    const { id } = request.params as { id: string };
    const { batchSize } = batchSchema.parse(request.body ?? {});
    try {
      return await processFollowupBatch(db, id, batchSize);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha no lote';
      return reply.status(message.includes('não encontrada') ? 404 : 409).send({ message });
    }
  });

  app.post('/internal/followup/campaigns/:id/refresh', async (request, reply) => {
    if (!verifyInternalToken(request)) return reply.status(403).send({ message: 'Forbidden' });
    const { id } = request.params as { id: string };
    return refreshFollowupCampaignMetrics(db, id);
  });

  app.post('/internal/followup/retry-due', async (request, reply) => {
    if (!verifyInternalToken(request)) return reply.status(403).send({ message: 'Forbidden' });
    const campaigns = await db.followupCampaign.findMany({
      where: { status: 'running', messages: { some: { status: 'queued', attempts: { gt: 0 }, nextAttemptAt: { lte: new Date() } } } },
      select: { id: true },
      take: 20,
    });
    const results = [];
    for (const campaign of campaigns) results.push(await processFollowupBatch(db, campaign.id, 10));
    return { campaigns: campaigns.length, results };
  });
}

async function triggerN8n(campaignId: string) {
  const response = await fetch(process.env.N8N_CAMPAIGN_WEBHOOK_URL!, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-Token': process.env.N8N_INTERNAL_TOKEN!,
    },
    body: JSON.stringify({ campaign_id: campaignId }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`n8n returned HTTP ${response.status}`);
}

function verifyInternalToken(request: FastifyRequest): boolean {
  const expected = process.env.N8N_INTERNAL_TOKEN ?? '';
  const supplied = String(request.headers['x-internal-token'] ?? '');
  if (!expected || !supplied) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(supplied);
  return left.length === right.length && timingSafeEqual(left, right);
}

function maskPhone(phone: string | null): string | null {
  if (!phone) return null;
  return phone.length < 8 ? '***' : `${phone.slice(0, 4)}***${phone.slice(-2)}`;
}

function csvCell(value: string): string {
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}
