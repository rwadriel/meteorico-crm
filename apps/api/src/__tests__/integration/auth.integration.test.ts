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

async function setupRole(db: PrismaClient) {
  const role = await db.role.create({
    data: { name: `owner-${crypto.randomUUID().slice(0, 8)}`, description: 'Test owner', isSystem: true },
  });
  await db.permission.create({
    data: { roleId: role.id, resource: 'campaigns', action: 'read' },
  });
  return role.id;
}

async function createUser(db: PrismaClient, email: string, password: string, roleId: string) {
  return db.adminUser.create({
    data: { email, passwordHash: await hashPassword(password), name: 'Test User', roleId },
  });
}

describe('Auth Integration', () => {
  let db: PrismaClient;

  beforeAll(async () => {
    db = new PrismaClient({ datasourceUrl: TEST_DB_URL });
  });

  afterAll(async () => {
    await cleanDb(db);
    await db.$disconnect();
  });

  it('POST /auth/login succeeds with valid credentials', async () => {
    await cleanDb(db);
    const roleId = await setupRole(db);
    await createUser(db, 'test@meteorico.dev', 'secure-password-123', roleId);
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'test@meteorico.dev', password: 'secure-password-123' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.user.email).toBe('test@meteorico.dev');

    const cookies = res.cookies as Array<{ name: string; value: string; httpOnly?: boolean }>;
    const sessionCookie = cookies.find((c) => c.name === 'meteorico_session');
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie!.httpOnly).toBe(true);

    await app.close();
  });

  it('POST /auth/login fails with wrong password', async () => {
    await cleanDb(db);
    const roleId = await setupRole(db);
    await createUser(db, 'wrong@meteorico.dev', 'correct-password', roleId);
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'wrong@meteorico.dev', password: 'wrong-password' },
    });

    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('POST /auth/login returns generic message for non-existent user', async () => {
    await cleanDb(db);
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'nonexistent@meteorico.dev', password: 'any-password' },
    });

    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body);
    expect(body.message).toBe('Invalid credentials');
    await app.close();
  });

  it('POST /auth/login fails for inactive user', async () => {
    await cleanDb(db);
    const roleId = await setupRole(db);
    const user = await createUser(db, 'inactive@meteorico.dev', 'password123', roleId);
    await db.adminUser.update({ where: { id: user.id }, data: { isActive: false } });

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'inactive@meteorico.dev', password: 'password123' },
    });

    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('GET /auth/me requires authentication', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/auth/me' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('GET /auth/me returns user with valid session', async () => {
    await cleanDb(db);
    const roleId = await setupRole(db);
    await createUser(db, 'me@meteorico.dev', 'my-password-123', roleId);
    const app = await buildApp();

    const loginRes = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'me@meteorico.dev', password: 'my-password-123' },
    });

    const cookies = loginRes.cookies as Array<{ name: string; value: string }>;
    const sessionCookie = cookies.find((c) => c.name === 'meteorico_session');

    const meRes = await app.inject({
      method: 'GET',
      url: '/auth/me',
      cookies: { meteorico_session: sessionCookie!.value },
    });

    expect(meRes.statusCode).toBe(200);
    const body = JSON.parse(meRes.body);
    expect(body.user.email).toBe('me@meteorico.dev');
    await app.close();
  });

  it('POST /auth/logout revokes session', async () => {
    await cleanDb(db);
    const roleId = await setupRole(db);
    await createUser(db, 'logout@meteorico.dev', 'logout-pass-123', roleId);
    const app = await buildApp();

    const loginRes = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'logout@meteorico.dev', password: 'logout-pass-123' },
    });

    const cookies = loginRes.cookies as Array<{ name: string; value: string }>;
    const sessionCookie = cookies.find((c) => c.name === 'meteorico_session');

    const logoutRes = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      cookies: { meteorico_session: sessionCookie!.value },
    });
    expect(logoutRes.statusCode).toBe(200);

    const meRes = await app.inject({
      method: 'GET',
      url: '/auth/me',
      cookies: { meteorico_session: sessionCookie!.value },
    });
    expect(meRes.statusCode).toBe(401);

    await app.close();
  });

  it('audit log records login and logout', async () => {
    await cleanDb(db);
    const roleId = await setupRole(db);
    await createUser(db, 'audit@meteorico.dev', 'audit-pass-123', roleId);
    const app = await buildApp();

    const loginRes = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'audit@meteorico.dev', password: 'audit-pass-123' },
    });

    const cookies = loginRes.cookies as Array<{ name: string; value: string }>;
    const sessionCookie = cookies.find((c) => c.name === 'meteorico_session');

    await app.inject({
      method: 'POST',
      url: '/auth/logout',
      cookies: { meteorico_session: sessionCookie!.value },
    });

    const logs = await db.auditLog.findMany({ orderBy: { createdAt: 'asc' } });
    expect(logs.length).toBeGreaterThanOrEqual(2);

    const loginLog = logs.find((l) => l.action === 'login.success');
    expect(loginLog).toBeDefined();
    expect(loginLog!.resource).toBe('auth');

    const logoutLog = logs.find((l) => l.action === 'logout');
    expect(logoutLog).toBeDefined();

    await app.close();
  });
});
