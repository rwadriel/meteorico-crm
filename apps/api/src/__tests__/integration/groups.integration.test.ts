import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { PrismaClient } from '@meteorico/database';
import { buildApp } from '../../app.js';
import { hashPassword } from '../../services/auth.js';

const TEST_DB_URL = process.env.DATABASE_URL ?? 'postgresql://meteorico:meteorico_dev@localhost:5432/meteorico_crm_test';

const PERMS = [
  { resource: 'campaigns', action: 'read' },
  { resource: 'campaigns', action: 'create' },
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

describe('Groups Integration', () => {
  let db: PrismaClient;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let sessionCookie: string;
  let campaignId: string;

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
      data: { email: 'grp@test.dev', passwordHash: await hashPassword('pass123'), name: 'Tester', roleId: role.id },
    });
    const loginRes = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: 'grp@test.dev', password: 'pass123' } });
    const cookies = loginRes.cookies as Array<{ name: string; value: string }>;
    sessionCookie = cookies.find((c) => c.name === 'meteorico_session')!.value;

    const campRes = await app.inject({
      method: 'POST', url: '/api/campaigns',
      cookies: { meteorico_session: sessionCookie },
      payload: { name: 'Camp', slug: `camp-${crypto.randomUUID().slice(0, 8)}` },
    });
    campaignId = JSON.parse(campRes.body).id;
  });

  it('creates a group', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/groups',
      cookies: { meteorico_session: sessionCookie },
      payload: { campaignId, name: 'Grupo Teste', category: 'novo' },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.name).toBe('Grupo Teste');
    expect(body.category).toBe('novo');
    expect(body.capacity).toBe(256);
    await app.close();
  });

  it('creates groups with all categories', async () => {
    const categories = ['novo', 'reparticipante', 'veterano', 'aluno', 'geral'];
    for (const cat of categories) {
      const res = await app.inject({
        method: 'POST', url: '/api/groups',
        cookies: { meteorico_session: sessionCookie },
        payload: { campaignId, name: `G-${cat}`, category: cat },
      });
      expect(res.statusCode).toBe(201);
      expect(JSON.parse(res.body).category).toBe(cat);
    }
    await app.close();
  });

  it('lists groups filtered by campaign', async () => {
    await app.inject({ method: 'POST', url: '/api/groups', cookies: { meteorico_session: sessionCookie }, payload: { campaignId, name: 'G1', category: 'novo' } });
    await app.inject({ method: 'POST', url: '/api/groups', cookies: { meteorico_session: sessionCookie }, payload: { campaignId, name: 'G2', category: 'veterano' } });

    const res = await app.inject({ method: 'GET', url: `/api/groups?campaignId=${campaignId}`, cookies: { meteorico_session: sessionCookie } });
    expect(JSON.parse(res.body).total).toBe(2);
    await app.close();
  });

  it('updates a group', async () => {
    const createRes = await app.inject({ method: 'POST', url: '/api/groups', cookies: { meteorico_session: sessionCookie }, payload: { campaignId, name: 'Old G', category: 'novo' } });
    const id = JSON.parse(createRes.body).id;

    const res = await app.inject({
      method: 'PUT', url: `/api/groups/${id}`,
      cookies: { meteorico_session: sessionCookie },
      payload: { name: 'New G', capacity: 100 },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).name).toBe('New G');
    expect(JSON.parse(res.body).capacity).toBe(100);
    await app.close();
  });

  it('deletes a group without memberships', async () => {
    const createRes = await app.inject({ method: 'POST', url: '/api/groups', cookies: { meteorico_session: sessionCookie }, payload: { campaignId, name: 'Del G', category: 'geral' } });
    const id = JSON.parse(createRes.body).id;

    const res = await app.inject({ method: 'DELETE', url: `/api/groups/${id}`, cookies: { meteorico_session: sessionCookie } });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('cannot create group for non-existent campaign', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/groups',
      cookies: { meteorico_session: sessionCookie },
      payload: { campaignId: '00000000-0000-0000-0000-000000000000', name: 'X', category: 'novo' },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('unauthenticated request returns 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/groups' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});
