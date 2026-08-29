import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@meteorico/database';
import { buildApp } from '../../app.js';
import { hashPassword } from '../../services/auth.js';

const TEST_DB_URL = process.env.DATABASE_URL ?? 'postgresql://meteorico:meteorico_dev@localhost:5432/meteorico_crm_test';

async function cleanDb(db: PrismaClient) {
  await db.auditLog.deleteMany();
  await db.session.deleteMany();
  await db.adminUser.deleteMany();
  await db.permission.deleteMany();
  await db.role.deleteMany();
}

describe('RBAC Integration', () => {
  let db: PrismaClient;

  beforeAll(async () => {
    db = new PrismaClient({ datasourceUrl: TEST_DB_URL });
  });

  afterAll(async () => {
    await cleanDb(db);
    await db.$disconnect();
  });

  async function loginAs(
    app: Awaited<ReturnType<typeof buildApp>>,
    email: string,
    password: string,
    roleName: string,
    permissions: Array<{ resource: string; action: string }>,
  ) {
    const role = await db.role.create({
      data: { name: `${roleName}-${crypto.randomUUID().slice(0, 8)}`, description: roleName, isSystem: true },
    });
    for (const perm of permissions) {
      await db.permission.create({ data: { roleId: role.id, resource: perm.resource, action: perm.action } });
    }
    await db.adminUser.create({
      data: { email, passwordHash: await hashPassword(password), name: 'Test', roleId: role.id },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email, password },
    });

    const cookies = res.cookies as Array<{ name: string; value: string }>;
    return cookies.find((c) => c.name === 'meteorico_session')!.value;
  }

  it('owner can access protected routes', async () => {
    await cleanDb(db);
    const app = await buildApp();
    const token = await loginAs(app, 'owner@rbac.dev', 'owner-pass-123', 'owner', [
      { resource: 'campaigns', action: 'read' },
      { resource: 'campaigns', action: 'create' },
    ]);

    const meRes = await app.inject({
      method: 'GET',
      url: '/auth/me',
      cookies: { meteorico_session: token },
    });

    expect(meRes.statusCode).toBe(200);
    await app.close();
  });

  it('read_only user can access /auth/me', async () => {
    await cleanDb(db);
    const app = await buildApp();
    const token = await loginAs(app, 'readonly@rbac.dev', 'readonly-pass-123', 'read_only', [
      { resource: 'campaigns', action: 'read' },
    ]);

    const meRes = await app.inject({
      method: 'GET',
      url: '/auth/me',
      cookies: { meteorico_session: token },
    });

    expect(meRes.statusCode).toBe(200);
    await app.close();
  });

  it('session listing shows only own sessions', async () => {
    await cleanDb(db);
    const app = await buildApp();
    const token = await loginAs(app, 'sessions@rbac.dev', 'sessions-pass-123', 'owner', []);

    const res = await app.inject({
      method: 'GET',
      url: '/auth/sessions',
      cookies: { meteorico_session: token },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.sessions.length).toBe(1);

    await app.close();
  });
});
