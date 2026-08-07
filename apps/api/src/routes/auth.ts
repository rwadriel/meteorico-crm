import type { FastifyInstance } from 'fastify';
import { getClient } from '@meteorico/database';
import { login, revokeSession } from '../services/auth.js';
import { writeAuditLog } from '../services/audit.js';
import { requireAuth } from '../middleware/auth.js';

const SESSION_COOKIE = 'meteorico_session';
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 24 * 60 * 60,
};

export async function authRoutes(app: FastifyInstance) {
  app.post('/auth/login', {
    schema: {
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 1 },
        },
      },
    },
  }, async (request, reply) => {
    const { email, password } = request.body as { email: string; password: string };
    const db = getClient();

    const result = await login(
      db,
      email,
      password,
      request.ip,
      request.headers['user-agent'] ?? '',
    );

    if (!result) {
      await writeAuditLog(db, {
        action: 'login.failed',
        resource: 'auth',
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'] ?? '',
      });
      return reply.status(401).send({ error: 'Unauthorized', message: 'Invalid credentials' });
    }

    await writeAuditLog(db, {
      userId: result.user.id,
      action: 'login.success',
      resource: 'auth',
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] ?? '',
    });

    reply.setCookie(SESSION_COOKIE, result.token, COOKIE_OPTIONS);
    return { user: result.user };
  });

  app.post('/auth/logout', { preHandler: [requireAuth] }, async (request, reply) => {
    const db = getClient();
    const tokenHash = request.user!.sessionTokenHash;

    await revokeSession(db, tokenHash);

    await writeAuditLog(db, {
      userId: request.user!.id,
      action: 'logout',
      resource: 'auth',
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] ?? '',
    });

    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { message: 'Logged out' };
  });

  app.get('/auth/me', { preHandler: [requireAuth] }, async (request) => {
    return {
      user: {
        id: request.user!.id,
        email: request.user!.email,
        name: request.user!.name,
        role: request.user!.role,
      },
    };
  });

  app.get('/auth/sessions', { preHandler: [requireAuth] }, async (request) => {
    const db = getClient();
    const sessions = await db.session.findMany({
      where: { userId: request.user!.id, expiresAt: { gt: new Date() } },
      select: { id: true, ipAddress: true, userAgent: true, createdAt: true, expiresAt: true },
      orderBy: { createdAt: 'desc' },
    });
    return { sessions };
  });
}
