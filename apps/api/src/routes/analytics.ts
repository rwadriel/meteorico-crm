import type { FastifyInstance } from 'fastify';
import { getClient } from '@meteorico/database';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import {
  getGlobalDashboard,
  getCampaignDashboard,
  getGroupDashboard,
  getContactTimeline,
  compareCampaigns,
  exportCampaignCsv,
  METRIC_DEFINITIONS,
} from '../services/analytics.js';

export async function analyticsRoutes(app: FastifyInstance) {
  app.addHook('onRequest', requireAuth);

  app.get('/analytics/dashboard', {
    preHandler: requirePermission('reports', 'read'),
  }, async (request, reply) => {
    const db = getClient();
    const query = request.query as { from?: string; to?: string };
    const dateFilter = parseDateFilter(query);
    const dashboard = await getGlobalDashboard(db, dateFilter);
    return reply.send(dashboard);
  });

  app.get<{ Params: { campaignId: string } }>('/analytics/campaigns/:campaignId', {
    preHandler: requirePermission('reports', 'read'),
  }, async (request, reply) => {
    const db = getClient();
    const query = request.query as { from?: string; to?: string };
    const dateFilter = parseDateFilter(query);
    try {
      const dashboard = await getCampaignDashboard(db, request.params.campaignId, dateFilter);
      return reply.send(dashboard);
    } catch {
      return reply.status(404).send({ error: 'Campaign not found' });
    }
  });

  app.get<{ Params: { groupId: string } }>('/analytics/groups/:groupId', {
    preHandler: requirePermission('reports', 'read'),
  }, async (request, reply) => {
    const db = getClient();
    try {
      const dashboard = await getGroupDashboard(db, request.params.groupId);
      return reply.send(dashboard);
    } catch {
      return reply.status(404).send({ error: 'Group not found' });
    }
  });

  app.get<{ Params: { contactId: string } }>('/analytics/contacts/:contactId/timeline', {
    preHandler: requirePermission('contacts', 'read'),
  }, async (request, reply) => {
    const db = getClient();
    const query = request.query as { page?: string; limit?: string };
    try {
      const timeline = await getContactTimeline(db, request.params.contactId, {
        page: query.page ? parseInt(query.page, 10) : undefined,
        limit: query.limit ? parseInt(query.limit, 10) : undefined,
      });
      return reply.send(timeline);
    } catch {
      return reply.status(404).send({ error: 'Contact not found' });
    }
  });

  app.post<{
    Body: { campaignIds: string[] };
  }>('/analytics/compare', {
    preHandler: requirePermission('reports', 'read'),
  }, async (request, reply) => {
    const db = getClient();
    const { campaignIds } = request.body;
    if (!campaignIds || campaignIds.length < 2 || campaignIds.length > 10) {
      return reply.status(400).send({ error: 'Provide 2-10 campaign IDs' });
    }
    const result = await compareCampaigns(db, campaignIds);
    return reply.send(result);
  });

  app.get<{ Params: { campaignId: string } }>('/analytics/campaigns/:campaignId/export', {
    preHandler: requirePermission('reports', 'export'),
  }, async (request, reply) => {
    const db = getClient();
    try {
      const csv = await exportCampaignCsv(db, request.params.campaignId);
      return reply
        .header('Content-Type', 'text/csv; charset=utf-8')
        .header('Content-Disposition', `attachment; filename="campaign-${request.params.campaignId}.csv"`)
        .send(csv);
    } catch {
      return reply.status(404).send({ error: 'Campaign not found' });
    }
  });

  app.get('/analytics/metrics', {
    preHandler: requirePermission('reports', 'read'),
  }, async (_request, reply) => {
    return reply.send({ metrics: METRIC_DEFINITIONS });
  });
}

function parseDateFilter(query: { from?: string; to?: string }) {
  const from = query.from ? new Date(query.from) : undefined;
  const to = query.to ? new Date(query.to) : undefined;
  if (from && isNaN(from.getTime())) return undefined;
  if (to && isNaN(to.getTime())) return undefined;
  if (!from && !to) return undefined;
  return { from, to };
}
