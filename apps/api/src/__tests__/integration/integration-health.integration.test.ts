import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { PrismaClient } from '@meteorico/database';
import { buildApp } from '../../app.js';
import { hashPassword } from '../../services/auth.js';

const TEST_DB_URL = process.env.DATABASE_URL ?? 'postgresql://meteorico:meteorico_dev@localhost:5432/meteorico_crm_test';

const PERMS = [
  { resource: 'integration', action: 'read' },
  { resource: 'integration', action: 'write' },
  { resource: 'campaigns', action: 'read' },
  { resource: 'campaigns', action: 'create' },
  { resource: 'groups', action: 'read' },
];

async function cleanDb(db: PrismaClient) {
  await db.groupEvent.deleteMany();
  await db.processedEvent.deleteMany();
  await db.integrationCursor.deleteMany();
  await db.groupMembership.deleteMany();
  await db.campaignParticipation.deleteMany();
  await db.importRow.deleteMany();
  await db.import.deleteMany();
  await db.group.deleteMany();
  await db.campaign.deleteMany();
  await db.auditLog.deleteMany();
  await db.session.deleteMany();
  await db.adminUser.deleteMany();
  await db.permission.deleteMany();
  await db.role.deleteMany();
}

describe('Integration Health API', () => {
  let db: PrismaClient;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let sessionCookie: string;
  let adminUserId: string;

  beforeAll(async () => {
    db = new PrismaClient({ datasourceUrl: TEST_DB_URL });
  });

  afterAll(async () => {
    await cleanDb(db);
    await db.$disconnect();
  });

  beforeEach(async () => {
    await cleanDb(db);
    app = await buildApp();
    const role = await db.role.create({
      data: { name: `role-${crypto.randomUUID().slice(0, 8)}`, description: 'admin', isSystem: true },
    });
    for (const perm of PERMS) {
      await db.permission.create({ data: { roleId: role.id, ...perm } });
    }
    const user = await db.adminUser.create({
      data: { email: 'integ@test.dev', passwordHash: await hashPassword('pass123'), name: 'Tester', roleId: role.id },
    });
    adminUserId = user.id;
    const loginRes = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: 'integ@test.dev', password: 'pass123' } });
    const cookies = loginRes.cookies as Array<{ name: string; value: string }>;
    sessionCookie = `meteorico_session=${cookies.find((c) => c.name === 'meteorico_session')!.value}`;
  });

  it('returns empty health status when no data', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/integration/health',
      headers: { cookie: sessionCookie },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.integration).toBe('whatsapp-manager');
    expect(body.lastPolledAt).toBeNull();
    expect(body.cursor).toBeNull();
    expect(body.totalProcessed).toBe(0);
    expect(body.totalDeadLettered).toBe(0);
  });

  it('returns health with cursor and processed events', async () => {
    await db.integrationCursor.create({
      data: {
        integration: 'whatsapp-manager',
        cursor: '42',
        lastPolledAt: new Date(),
      },
    });

    await db.processedEvent.create({
      data: {
        eventSource: 'whatsapp-manager',
        externalEventId: 'test-evt-1',
        eventType: 'entrou',
        result: 'processed:1-participants',
      },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/integration/health',
      headers: { cookie: sessionCookie },
    });

    const body = res.json();
    expect(body.cursor).toBe('42');
    expect(body.totalProcessed).toBe(1);
    expect(body.lastEventType).toBe('entrou');
  });

  it('returns dead-lettered events in recentErrors', async () => {
    await db.processedEvent.create({
      data: {
        eventSource: 'whatsapp-manager',
        externalEventId: 'dead-1',
        eventType: 'entrou',
        result: 'dead-letter:unknown-group',
      },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/integration/health',
      headers: { cookie: sessionCookie },
    });

    const body = res.json();
    expect(body.totalDeadLettered).toBe(1);
    expect(body.recentErrors).toHaveLength(1);
    expect(body.recentErrors[0].result).toBe('dead-letter:unknown-group');
  });

  it('returns orphan groups', async () => {
    const orphanCampaign = await db.campaign.create({
      data: { name: 'Eventos Orfaos', slug: '_orphan-events', status: 'historical', createdBy: adminUserId },
    });

    await db.group.create({
      data: {
        campaignId: orphanCampaign.id,
        whatsappId: 'wid-orphan-1',
        name: 'Grupo Desconhecido',
        category: 'geral',
        isActive: false,
      },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/integration/orphan-groups',
      headers: { cookie: sessionCookie },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.groups).toHaveLength(1);
    expect(body.groups[0].name).toBe('Grupo Desconhecido');
  });

  it('assigns orphan group to campaign', async () => {
    const orphanCampaign = await db.campaign.create({
      data: { name: 'Eventos Orfaos', slug: '_orphan-events', status: 'historical', createdBy: adminUserId },
    });

    const realCampaign = await db.campaign.create({
      data: { name: 'Real Campaign', slug: 'real-campaign', createdBy: adminUserId },
    });

    const orphanGroup = await db.group.create({
      data: {
        campaignId: orphanCampaign.id,
        whatsappId: 'wid-orphan-2',
        name: 'Grupo Orfao',
        category: 'geral',
        isActive: false,
      },
    });

    const res = await app.inject({
      method: 'POST',
      url: `/integration/orphan-groups/${orphanGroup.id}/assign`,
      headers: { cookie: sessionCookie },
      payload: { campaignId: realCampaign.id },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.campaignId).toBe(realCampaign.id);
    expect(body.isActive).toBe(true);
  });

  it('requires authentication', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/integration/health',
    });

    expect(res.statusCode).toBe(401);
  });
});
