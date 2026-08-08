import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { PrismaClient } from '@meteorico/database';
import { buildApp } from '../../app.js';
import { hashPassword } from '../../services/auth.js';

const TEST_DB_URL = process.env.DATABASE_URL ?? 'postgresql://meteorico:meteorico_dev@localhost:5432/meteorico_crm_test';

const PERMS = [
  { resource: 'campaigns', action: 'read' },
  { resource: 'campaigns', action: 'create' },
  { resource: 'campaigns', action: 'update' },
  { resource: 'campaigns', action: 'delete' },
  { resource: 'groups', action: 'read' },
  { resource: 'groups', action: 'create' },
  { resource: 'groups', action: 'update' },
  { resource: 'groups', action: 'delete' },
];

async function cleanDb(db: PrismaClient) {
  await db.importRow.deleteMany();
  await db.import.deleteMany();
  await db.campaignParticipation.deleteMany();
  await db.campaignVersion.deleteMany();
  await db.group.deleteMany();
  await db.campaign.deleteMany();
  await db.auditLog.deleteMany();
  await db.session.deleteMany();
  await db.adminUser.deleteMany();
  await db.permission.deleteMany();
  await db.role.deleteMany();
}

describe('Campaigns Integration', () => {
  let db: PrismaClient;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let sessionCookie: string;

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
      data: { name: `admin-${crypto.randomUUID().slice(0, 8)}`, description: 'admin', isSystem: true },
    });
    for (const perm of PERMS) {
      await db.permission.create({ data: { roleId: role.id, ...perm } });
    }
    await db.adminUser.create({
      data: { email: 'camp@test.dev', passwordHash: await hashPassword('pass123'), name: 'Tester', roleId: role.id },
    });
    const loginRes = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: 'camp@test.dev', password: 'pass123' } });
    const cookies = loginRes.cookies as Array<{ name: string; value: string }>;
    sessionCookie = cookies.find((c) => c.name === 'meteorico_session')!.value;
  });

  it('creates a campaign', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/campaigns',
      cookies: { meteorico_session: sessionCookie },
      payload: { name: 'Lancamento Teste', slug: 'lancamento-teste', cartOpenDay: 'wednesday' },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.name).toBe('Lancamento Teste');
    expect(body.status).toBe('draft');
    await app.close();
  });

  it('rejects duplicate slug', async () => {
    await app.inject({
      method: 'POST', url: '/api/campaigns',
      cookies: { meteorico_session: sessionCookie },
      payload: { name: 'A', slug: 'dup-slug' },
    });
    const res = await app.inject({
      method: 'POST', url: '/api/campaigns',
      cookies: { meteorico_session: sessionCookie },
      payload: { name: 'B', slug: 'dup-slug' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('lists campaigns with status filter', async () => {
    await app.inject({ method: 'POST', url: '/api/campaigns', cookies: { meteorico_session: sessionCookie }, payload: { name: 'D1', slug: 'd1' } });
    await app.inject({ method: 'POST', url: '/api/campaigns', cookies: { meteorico_session: sessionCookie }, payload: { name: 'D2', slug: 'd2' } });

    const allRes = await app.inject({ method: 'GET', url: '/api/campaigns', cookies: { meteorico_session: sessionCookie } });
    expect(JSON.parse(allRes.body).total).toBe(2);

    const draftRes = await app.inject({ method: 'GET', url: '/api/campaigns?status=draft', cookies: { meteorico_session: sessionCookie } });
    expect(JSON.parse(draftRes.body).total).toBe(2);

    const activeRes = await app.inject({ method: 'GET', url: '/api/campaigns?status=active', cookies: { meteorico_session: sessionCookie } });
    expect(JSON.parse(activeRes.body).total).toBe(0);
    await app.close();
  });

  it('lists campaigns with search', async () => {
    await app.inject({ method: 'POST', url: '/api/campaigns', cookies: { meteorico_session: sessionCookie }, payload: { name: 'Alpha Launch', slug: 'alpha' } });
    await app.inject({ method: 'POST', url: '/api/campaigns', cookies: { meteorico_session: sessionCookie }, payload: { name: 'Beta Launch', slug: 'beta' } });

    const res = await app.inject({ method: 'GET', url: '/api/campaigns?search=Alpha', cookies: { meteorico_session: sessionCookie } });
    expect(JSON.parse(res.body).total).toBe(1);
    await app.close();
  });

  it('updates a draft campaign', async () => {
    const createRes = await app.inject({ method: 'POST', url: '/api/campaigns', cookies: { meteorico_session: sessionCookie }, payload: { name: 'Old', slug: 'old' } });
    const id = JSON.parse(createRes.body).id;

    const res = await app.inject({
      method: 'PUT', url: `/api/campaigns/${id}`,
      cookies: { meteorico_session: sessionCookie },
      payload: { name: 'New Name' },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).name).toBe('New Name');
    await app.close();
  });

  it('deletes a draft campaign', async () => {
    const createRes = await app.inject({ method: 'POST', url: '/api/campaigns', cookies: { meteorico_session: sessionCookie }, payload: { name: 'Del', slug: 'del' } });
    const id = JSON.parse(createRes.body).id;

    const res = await app.inject({ method: 'DELETE', url: `/api/campaigns/${id}`, cookies: { meteorico_session: sessionCookie } });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('cannot delete non-draft campaign', async () => {
    const createRes = await app.inject({ method: 'POST', url: '/api/campaigns', cookies: { meteorico_session: sessionCookie }, payload: { name: 'Nd', slug: 'nd', startsAt: new Date().toISOString(), endsAt: new Date(Date.now() + 86400000).toISOString() } });
    const id = JSON.parse(createRes.body).id;

    await app.inject({ method: 'POST', url: '/api/groups', cookies: { meteorico_session: sessionCookie }, payload: { campaignId: id, name: 'G1', category: 'novo' } });
    await app.inject({ method: 'POST', url: `/api/campaigns/${id}/activate`, cookies: { meteorico_session: sessionCookie } });

    const res = await app.inject({ method: 'DELETE', url: `/api/campaigns/${id}`, cookies: { meteorico_session: sessionCookie } });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('activates a campaign with groups and dates', async () => {
    const createRes = await app.inject({
      method: 'POST', url: '/api/campaigns', cookies: { meteorico_session: sessionCookie },
      payload: { name: 'Act', slug: 'act', startsAt: new Date().toISOString(), endsAt: new Date(Date.now() + 86400000).toISOString() },
    });
    const id = JSON.parse(createRes.body).id;

    await app.inject({ method: 'POST', url: '/api/groups', cookies: { meteorico_session: sessionCookie }, payload: { campaignId: id, name: 'G', category: 'novo' } });
    const res = await app.inject({ method: 'POST', url: `/api/campaigns/${id}/activate`, cookies: { meteorico_session: sessionCookie } });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).status).toBe('active');
    await app.close();
  });

  it('cannot activate without groups', async () => {
    const createRes = await app.inject({
      method: 'POST', url: '/api/campaigns', cookies: { meteorico_session: sessionCookie },
      payload: { name: 'NoG', slug: 'nog', startsAt: new Date().toISOString(), endsAt: new Date(Date.now() + 86400000).toISOString() },
    });
    const id = JSON.parse(createRes.body).id;

    const res = await app.inject({ method: 'POST', url: `/api/campaigns/${id}/activate`, cookies: { meteorico_session: sessionCookie } });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('cannot activate without dates', async () => {
    const createRes = await app.inject({ method: 'POST', url: '/api/campaigns', cookies: { meteorico_session: sessionCookie }, payload: { name: 'NoD', slug: 'nod' } });
    const id = JSON.parse(createRes.body).id;
    await app.inject({ method: 'POST', url: '/api/groups', cookies: { meteorico_session: sessionCookie }, payload: { campaignId: id, name: 'G', category: 'novo' } });

    const res = await app.inject({ method: 'POST', url: `/api/campaigns/${id}/activate`, cookies: { meteorico_session: sessionCookie } });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('cannot have two active campaigns', async () => {
    const c1Res = await app.inject({ method: 'POST', url: '/api/campaigns', cookies: { meteorico_session: sessionCookie }, payload: { name: 'C1', slug: 'c1', startsAt: new Date().toISOString(), endsAt: new Date(Date.now() + 86400000).toISOString() } });
    const c1Id = JSON.parse(c1Res.body).id;
    await app.inject({ method: 'POST', url: '/api/groups', cookies: { meteorico_session: sessionCookie }, payload: { campaignId: c1Id, name: 'G1', category: 'novo' } });
    await app.inject({ method: 'POST', url: `/api/campaigns/${c1Id}/activate`, cookies: { meteorico_session: sessionCookie } });

    const c2Res = await app.inject({ method: 'POST', url: '/api/campaigns', cookies: { meteorico_session: sessionCookie }, payload: { name: 'C2', slug: 'c2', startsAt: new Date().toISOString(), endsAt: new Date(Date.now() + 86400000).toISOString() } });
    const c2Id = JSON.parse(c2Res.body).id;
    await app.inject({ method: 'POST', url: '/api/groups', cookies: { meteorico_session: sessionCookie }, payload: { campaignId: c2Id, name: 'G2', category: 'novo' } });

    const res = await app.inject({ method: 'POST', url: `/api/campaigns/${c2Id}/activate`, cookies: { meteorico_session: sessionCookie } });
    expect(res.statusCode).toBe(409);
    await app.close();
  });

  it('completes an active campaign', async () => {
    const createRes = await app.inject({ method: 'POST', url: '/api/campaigns', cookies: { meteorico_session: sessionCookie }, payload: { name: 'Comp', slug: 'comp', startsAt: new Date().toISOString(), endsAt: new Date(Date.now() + 86400000).toISOString() } });
    const id = JSON.parse(createRes.body).id;
    await app.inject({ method: 'POST', url: '/api/groups', cookies: { meteorico_session: sessionCookie }, payload: { campaignId: id, name: 'G', category: 'novo' } });
    await app.inject({ method: 'POST', url: `/api/campaigns/${id}/activate`, cookies: { meteorico_session: sessionCookie } });

    const res = await app.inject({ method: 'POST', url: `/api/campaigns/${id}/complete`, cookies: { meteorico_session: sessionCookie } });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).status).toBe('completed');
    await app.close();
  });

  it('archives a completed campaign', async () => {
    const createRes = await app.inject({ method: 'POST', url: '/api/campaigns', cookies: { meteorico_session: sessionCookie }, payload: { name: 'Arch', slug: 'arch', startsAt: new Date().toISOString(), endsAt: new Date(Date.now() + 86400000).toISOString() } });
    const id = JSON.parse(createRes.body).id;
    await app.inject({ method: 'POST', url: '/api/groups', cookies: { meteorico_session: sessionCookie }, payload: { campaignId: id, name: 'G', category: 'novo' } });
    await app.inject({ method: 'POST', url: `/api/campaigns/${id}/activate`, cookies: { meteorico_session: sessionCookie } });
    await app.inject({ method: 'POST', url: `/api/campaigns/${id}/complete`, cookies: { meteorico_session: sessionCookie } });

    const res = await app.inject({ method: 'POST', url: `/api/campaigns/${id}/archive`, cookies: { meteorico_session: sessionCookie } });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).status).toBe('archived');
    await app.close();
  });

  it('duplicates campaign with groups and shifted dates', async () => {
    const createRes = await app.inject({
      method: 'POST', url: '/api/campaigns', cookies: { meteorico_session: sessionCookie },
      payload: { name: 'Original', slug: 'original', editionNumber: 10, startsAt: '2026-01-01T00:00:00.000Z', endsAt: '2026-01-07T00:00:00.000Z' },
    });
    const id = JSON.parse(createRes.body).id;
    await app.inject({ method: 'POST', url: '/api/groups', cookies: { meteorico_session: sessionCookie }, payload: { campaignId: id, name: 'G-Orig', category: 'veterano', capacity: 100 } });

    const res = await app.inject({ method: 'POST', url: `/api/campaigns/${id}/duplicate`, cookies: { meteorico_session: sessionCookie }, payload: {} });
    expect(res.statusCode).toBe(201);
    const dup = JSON.parse(res.body);
    expect(dup.status).toBe('draft');
    expect(dup.editionNumber).toBe(11);
    expect(dup.groups).toHaveLength(1);
    expect(dup.groups[0].name).toBe('G-Orig');

    const dupStart = new Date(dup.startsAt).getTime();
    const origStart = new Date('2026-01-01T00:00:00.000Z').getTime();
    expect(dupStart - origStart).toBe(7 * 24 * 60 * 60 * 1000);
    await app.close();
  });

  it('publishes and lists versions', async () => {
    const createRes = await app.inject({ method: 'POST', url: '/api/campaigns', cookies: { meteorico_session: sessionCookie }, payload: { name: 'Ver', slug: 'ver' } });
    const id = JSON.parse(createRes.body).id;

    const pubRes = await app.inject({
      method: 'POST', url: `/api/campaigns/${id}/versions`,
      cookies: { meteorico_session: sessionCookie },
      payload: { config: { key: 'value' } },
    });
    expect(pubRes.statusCode).toBe(201);
    expect(JSON.parse(pubRes.body).version).toBe(1);

    const listRes = await app.inject({ method: 'GET', url: `/api/campaigns/${id}/versions`, cookies: { meteorico_session: sessionCookie } });
    expect(JSON.parse(listRes.body)).toHaveLength(1);
    await app.close();
  });

  it('unauthenticated request returns 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/campaigns' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('cannot update completed campaign', async () => {
    const createRes = await app.inject({ method: 'POST', url: '/api/campaigns', cookies: { meteorico_session: sessionCookie }, payload: { name: 'NoUp', slug: 'noup', startsAt: new Date().toISOString(), endsAt: new Date(Date.now() + 86400000).toISOString() } });
    const id = JSON.parse(createRes.body).id;
    await app.inject({ method: 'POST', url: '/api/groups', cookies: { meteorico_session: sessionCookie }, payload: { campaignId: id, name: 'G', category: 'novo' } });
    await app.inject({ method: 'POST', url: `/api/campaigns/${id}/activate`, cookies: { meteorico_session: sessionCookie } });
    await app.inject({ method: 'POST', url: `/api/campaigns/${id}/complete`, cookies: { meteorico_session: sessionCookie } });

    const res = await app.inject({ method: 'PUT', url: `/api/campaigns/${id}`, cookies: { meteorico_session: sessionCookie }, payload: { name: 'Changed' } });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});
