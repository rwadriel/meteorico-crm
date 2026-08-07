import type { FastifyRequest, FastifyReply } from 'fastify';
import { getClient } from '@meteorico/database';
import { validateSession, hashSessionToken } from '../services/auth.js';

const SESSION_COOKIE = 'meteorico_session';

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  const token = request.cookies[SESSION_COOKIE];
  if (!token) {
    return reply.status(401).send({ error: 'Unauthorized', message: 'Authentication required' });
  }

  const session = await validateSession(getClient(), token);
  if (!session) {
    return reply.status(401).send({ error: 'Unauthorized', message: 'Invalid or expired session' });
  }

  request.user = {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    role: session.user.role.name,
    permissions: session.user.role.permissions.map((p: { resource: string; action: string }) => `${p.resource}:${p.action}`),
    sessionTokenHash: hashSessionToken(token),
  };
}

export function requirePermission(resource: string, action: string) {
  return async function (request: FastifyRequest, reply: FastifyReply) {
    if (!request.user) {
      return reply.status(401).send({ error: 'Unauthorized', message: 'Authentication required' });
    }

    if (request.user.role === 'owner') return;

    const required = `${resource}:${action}`;
    if (!request.user.permissions.includes(required)) {
      return reply.status(403).send({ error: 'Forbidden', message: 'Insufficient permissions' });
    }
  };
}
