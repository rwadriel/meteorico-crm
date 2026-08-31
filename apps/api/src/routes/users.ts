import type { FastifyInstance } from 'fastify';
import { getClient } from '@meteorico/database';
import { z } from 'zod';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { hashPassword, revokeAllUserSessions } from '../services/auth.js';
import { writeAuditLog } from '../services/audit.js';

const createUserSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(200).transform((value) => value.toLowerCase()),
  password: z.string().min(12).max(200),
  roleId: z.string().uuid(),
});

const updateUserSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  roleId: z.string().uuid().optional(),
  isActive: z.boolean().optional(),
}).refine((value) => Object.keys(value).length > 0, { message: 'Informe ao menos uma alteração' });

const resetPasswordSchema = z.object({
  password: z.string().min(12).max(200),
});

const userSelect = {
  id: true,
  name: true,
  email: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
  role: { select: { id: true, name: true, description: true } },
} as const;

export async function userRoutes(app: FastifyInstance) {
  const db = getClient();
  app.addHook('onRequest', requireAuth);

  app.get('/users', {
    preHandler: requirePermission('users', 'read'),
  }, async () => ({
    users: await db.adminUser.findMany({
      select: userSelect,
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    }),
  }));

  app.get('/users/roles', {
    preHandler: requirePermission('users', 'read'),
  }, async () => ({
    roles: await db.role.findMany({
      where: { isSystem: true, name: { not: 'owner' } },
      select: { id: true, name: true, description: true },
      orderBy: { name: 'asc' },
    }),
  }));

  app.post('/users', {
    preHandler: requirePermission('users', 'create'),
  }, async (request, reply) => {
    const input = createUserSchema.parse(request.body);
    const role = await findAssignableRole(db, input.roleId);
    if (!role) return reply.status(400).send({ message: 'Escolha um perfil permitido' });

    try {
      const user = await db.adminUser.create({
        data: {
          name: input.name,
          email: input.email,
          passwordHash: await hashPassword(input.password),
          roleId: role.id,
        },
        select: userSelect,
      });
      await writeAuditLog(db, {
        userId: request.user!.id,
        action: 'user.create',
        resource: 'users',
        resourceId: user.id,
        newValue: { name: user.name, email: user.email, role: user.role.name },
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'] ?? '',
      });
      return reply.status(201).send({ user });
    } catch (error) {
      if (isUniqueConstraint(error)) {
        return reply.status(409).send({ message: 'Já existe um usuário com este e-mail' });
      }
      throw error;
    }
  });

  app.patch('/users/:id', {
    preHandler: requirePermission('users', 'update'),
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    if (id === request.user!.id) {
      return reply.status(400).send({ message: 'Seu próprio acesso não pode ser alterado por esta tela' });
    }
    const input = updateUserSchema.parse(request.body);
    const current = await db.adminUser.findUnique({ where: { id }, include: { role: true } });
    if (!current) return reply.status(404).send({ message: 'Usuário não encontrado' });
    if (current.role.name === 'owner') {
      return reply.status(403).send({ message: 'O proprietário principal não pode ser alterado' });
    }
    if (input.roleId && !(await findAssignableRole(db, input.roleId))) {
      return reply.status(400).send({ message: 'Escolha um perfil permitido' });
    }

    const user = await db.adminUser.update({
      where: { id },
      data: input,
      select: userSelect,
    });
    if (input.isActive === false || input.roleId) await revokeAllUserSessions(db, id);
    await writeAuditLog(db, {
      userId: request.user!.id,
      action: 'user.update',
      resource: 'users',
      resourceId: id,
      oldValue: { name: current.name, role: current.role.name, isActive: current.isActive },
      newValue: { name: user.name, role: user.role.name, isActive: user.isActive },
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] ?? '',
    });
    return { user };
  });

  app.post('/users/:id/reset-password', {
    preHandler: requirePermission('users', 'update'),
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    if (id === request.user!.id) {
      return reply.status(400).send({ message: 'Use a seção Segurança para alterar sua própria senha' });
    }
    const input = resetPasswordSchema.parse(request.body);
    const current = await db.adminUser.findUnique({ where: { id }, include: { role: true } });
    if (!current) return reply.status(404).send({ message: 'Usuário não encontrado' });
    if (current.role.name === 'owner') {
      return reply.status(403).send({ message: 'A senha do proprietário principal não pode ser redefinida aqui' });
    }

    await db.adminUser.update({
      where: { id },
      data: { passwordHash: await hashPassword(input.password) },
    });
    await revokeAllUserSessions(db, id);
    await writeAuditLog(db, {
      userId: request.user!.id,
      action: 'user.password_reset',
      resource: 'users',
      resourceId: id,
      newValue: { email: current.email },
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] ?? '',
    });
    return { message: 'Senha redefinida e sessões anteriores encerradas' };
  });
}

async function findAssignableRole(db: ReturnType<typeof getClient>, roleId: string) {
  return db.role.findFirst({ where: { id: roleId, isSystem: true, name: { not: 'owner' } } });
}

function isUniqueConstraint(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}
