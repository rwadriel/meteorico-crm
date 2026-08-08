import type { FastifyInstance } from 'fastify';
import { getClient, Prisma } from '@meteorico/database';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { writeAuditLog } from '../services/audit.js';
import {
  createCampaignSchema,
  updateCampaignSchema,
  duplicateCampaignSchema,
  listCampaignsSchema,
  campaignVersionSchema,
} from '../schemas/campaign.js';
import {
  listCampaigns,
  getCampaign,
  createCampaign,
  updateCampaign,
  deleteCampaign,
  duplicateCampaign,
  activateCampaign,
  completeCampaign,
  archiveCampaign,
  publishVersion,
  getVersions,
} from '../services/campaign.js';

export async function campaignRoutes(app: FastifyInstance) {
  const db = getClient();

  app.addHook('onRequest', requireAuth);

  app.get('/campaigns', {
    preHandler: requirePermission('campaigns', 'read'),
  }, async (request) => {
    const query = listCampaignsSchema.parse(request.query);
    return listCampaigns(db, query);
  });

  app.get('/campaigns/:id', {
    preHandler: requirePermission('campaigns', 'read'),
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      return await getCampaign(db, id);
    } catch {
      return reply.status(404).send({ message: 'Campaign not found' });
    }
  });

  app.post('/campaigns', {
    preHandler: requirePermission('campaigns', 'create'),
  }, async (request, reply) => {
    const data = createCampaignSchema.parse(request.body);
    try {
      const campaign = await createCampaign(db, {
        ...data,
        captationStartsAt: data.captationStartsAt ? new Date(data.captationStartsAt) : null,
        startsAt: data.startsAt ? new Date(data.startsAt) : null,
        endsAt: data.endsAt ? new Date(data.endsAt) : null,
      }, request.user!.id);
      await writeAuditLog(db, {
        userId: request.user!.id,
        action: 'campaign.create',
        resource: 'campaigns',
        resourceId: campaign.id,
        newValue: data,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'] ?? '',
      });
      return reply.status(201).send(campaign);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Create failed';
      return reply.status(400).send({ message });
    }
  });

  app.put('/campaigns/:id', {
    preHandler: requirePermission('campaigns', 'update'),
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const data = updateCampaignSchema.parse(request.body);
    try {
      const campaign = await updateCampaign(db, id, data);
      await writeAuditLog(db, {
        userId: request.user!.id,
        action: 'campaign.update',
        resource: 'campaigns',
        resourceId: id,
        newValue: data,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'] ?? '',
      });
      return campaign;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Update failed';
      const status = message.includes('not found') ? 404 : 400;
      return reply.status(status).send({ message });
    }
  });

  app.delete('/campaigns/:id', {
    preHandler: requirePermission('campaigns', 'delete'),
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      await deleteCampaign(db, id);
      await writeAuditLog(db, {
        userId: request.user!.id,
        action: 'campaign.delete',
        resource: 'campaigns',
        resourceId: id,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'] ?? '',
      });
      return { message: 'Deleted' };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Delete failed';
      return reply.status(400).send({ message });
    }
  });

  app.post('/campaigns/:id/duplicate', {
    preHandler: requirePermission('campaigns', 'create'),
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const overrides = duplicateCampaignSchema.parse(request.body ?? {});
    try {
      const campaign = await duplicateCampaign(db, id, overrides, request.user!.id);
      if (!campaign) {
        return reply.status(500).send({ message: 'Failed to create duplicate' });
      }
      await writeAuditLog(db, {
        userId: request.user!.id,
        action: 'campaign.duplicate',
        resource: 'campaigns',
        resourceId: campaign.id,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'] ?? '',
      });
      return reply.status(201).send(campaign);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Duplicate failed';
      return reply.status(400).send({ message });
    }
  });

  app.post('/campaigns/:id/activate', {
    preHandler: requirePermission('campaigns', 'update'),
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const campaign = await activateCampaign(db, id);
      await writeAuditLog(db, {
        userId: request.user!.id,
        action: 'campaign.activate',
        resource: 'campaigns',
        resourceId: id,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'] ?? '',
      });
      return campaign;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Activation failed';
      const status = message.includes('already active') ? 409 : 400;
      return reply.status(status).send({ message });
    }
  });

  app.post('/campaigns/:id/complete', {
    preHandler: requirePermission('campaigns', 'update'),
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const campaign = await completeCampaign(db, id);
      await writeAuditLog(db, {
        userId: request.user!.id,
        action: 'campaign.complete',
        resource: 'campaigns',
        resourceId: id,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'] ?? '',
      });
      return campaign;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Complete failed';
      return reply.status(400).send({ message });
    }
  });

  app.post('/campaigns/:id/archive', {
    preHandler: requirePermission('campaigns', 'update'),
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const campaign = await archiveCampaign(db, id);
      await writeAuditLog(db, {
        userId: request.user!.id,
        action: 'campaign.archive',
        resource: 'campaigns',
        resourceId: id,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'] ?? '',
      });
      return campaign;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Archive failed';
      return reply.status(400).send({ message });
    }
  });

  app.post('/campaigns/:id/versions', {
    preHandler: requirePermission('campaigns', 'update'),
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { config } = campaignVersionSchema.parse(request.body);
    try {
      const version = await publishVersion(db, id, config as Prisma.InputJsonValue);
      return reply.status(201).send(version);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Publish failed';
      return reply.status(400).send({ message });
    }
  });

  app.get('/campaigns/:id/versions', {
    preHandler: requirePermission('campaigns', 'read'),
  }, async (request) => {
    const { id } = request.params as { id: string };
    return getVersions(db, id);
  });
}
