import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  db: {
    adminUser: {
      findMany: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    role: { findMany: vi.fn(), findFirst: vi.fn() },
  },
  hashPassword: vi.fn(),
  revokeAllUserSessions: vi.fn(),
  writeAuditLog: vi.fn(),
}));

vi.mock('@meteorico/database', () => ({ getClient: () => mocks.db }));
vi.mock('../middleware/auth.js', () => ({
  requireAuth: async (request: { user?: unknown }) => {
    request.user = {
      id: '00000000-0000-4000-8000-000000000001',
      email: 'owner@test.dev',
      name: 'Owner',
      role: 'owner',
      permissions: [],
      sessionTokenHash: 'hash',
    };
  },
  requirePermission: () => async () => undefined,
}));
vi.mock('../services/auth.js', () => ({
  hashPassword: mocks.hashPassword,
  revokeAllUserSessions: mocks.revokeAllUserSessions,
}));
vi.mock('../services/audit.js', () => ({ writeAuditLog: mocks.writeAuditLog }));

import { userRoutes } from '../routes/users.js';

const roleId = '00000000-0000-4000-8000-000000000002';
const createdUserId = '00000000-0000-4000-8000-000000000003';

describe('User routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hashPassword.mockResolvedValue('secure-hash');
    mocks.db.role.findFirst.mockResolvedValue({ id: roleId, name: 'operator' });
    mocks.db.adminUser.create.mockResolvedValue({
      id: createdUserId,
      name: 'Nova Pessoa',
      email: 'pessoa@example.com',
      isActive: true,
      lastLoginAt: null,
      createdAt: new Date(),
      role: { id: roleId, name: 'operator', description: 'Opera campanhas' },
    });
  });

  it('creates an assignable user without recording the password in the audit log', async () => {
    const app = Fastify();
    await app.register(userRoutes);

    const response = await app.inject({
      method: 'POST',
      url: '/users',
      payload: {
        name: 'Nova Pessoa',
        email: 'PESSOA@example.com',
        password: 'senha-provisoria-123',
        roleId,
      },
    });

    expect(response.statusCode).toBe(201);
    expect(mocks.hashPassword).toHaveBeenCalledWith('senha-provisoria-123');
    expect(mocks.db.adminUser.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ email: 'pessoa@example.com', passwordHash: 'secure-hash' }),
    }));
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      action: 'user.create',
      newValue: { name: 'Nova Pessoa', email: 'pessoa@example.com', role: 'operator' },
    }));
    expect(JSON.stringify(mocks.writeAuditLog.mock.calls)).not.toContain('senha-provisoria-123');
    await app.close();
  });

  it('rejects a role that cannot be assigned from the CRM', async () => {
    mocks.db.role.findFirst.mockResolvedValue(null);
    const app = Fastify();
    await app.register(userRoutes);

    const response = await app.inject({
      method: 'POST',
      url: '/users',
      payload: {
        name: 'Nova Pessoa',
        email: 'pessoa@example.com',
        password: 'senha-provisoria-123',
        roleId,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(mocks.db.adminUser.create).not.toHaveBeenCalled();
    await app.close();
  });

  it('does not allow the current owner to disable their own access', async () => {
    const app = Fastify();
    await app.register(userRoutes);

    const response = await app.inject({
      method: 'PATCH',
      url: '/users/00000000-0000-4000-8000-000000000001',
      payload: { isActive: false },
    });

    expect(response.statusCode).toBe(400);
    expect(mocks.db.adminUser.update).not.toHaveBeenCalled();
    await app.close();
  });
});
