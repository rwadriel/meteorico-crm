import { randomBytes, createHash } from 'node:crypto';
import argon2 from 'argon2';
import type { PrismaClient } from '@meteorico/database';

const SESSION_DURATION_MS = 24 * 60 * 60 * 1000;

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  return argon2.verify(hash, password);
}

export function generateSessionToken(): string {
  return randomBytes(32).toString('hex');
}

export async function createSession(
  db: PrismaClient,
  userId: string,
  ipAddress: string,
  userAgent: string,
): Promise<{ token: string; expiresAt: Date }> {
  const token = generateSessionToken();
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  await db.session.create({
    data: { userId, tokenHash, ipAddress, userAgent, expiresAt },
  });

  return { token, expiresAt };
}

export async function validateSession(
  db: PrismaClient,
  token: string,
) {
  const tokenHash = hashSessionToken(token);
  const session = await db.session.findFirst({
    where: { tokenHash, expiresAt: { gt: new Date() } },
    include: { user: { include: { role: { include: { permissions: true } } } } },
  });

  if (!session || !session.user.isActive) return null;

  await db.session.update({
    where: { id: session.id },
    data: { expiresAt: new Date(Date.now() + SESSION_DURATION_MS) },
  });

  return session;
}

export async function revokeSession(db: PrismaClient, tokenHash: string): Promise<void> {
  await db.session.deleteMany({ where: { tokenHash } });
}

export async function revokeAllUserSessions(db: PrismaClient, userId: string): Promise<void> {
  await db.session.deleteMany({ where: { userId } });
}

export async function login(
  db: PrismaClient,
  email: string,
  password: string,
  ipAddress: string,
  userAgent: string,
) {
  const user = await db.adminUser.findUnique({
    where: { email },
    include: { role: { include: { permissions: true } } },
  });

  if (!user || !user.isActive) return null;

  const valid = await verifyPassword(user.passwordHash, password);
  if (!valid) return null;

  await revokeAllUserSessions(db, user.id);

  const session = await createSession(db, user.id, ipAddress, userAgent);

  await db.adminUser.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role.name,
    },
    token: session.token,
    expiresAt: session.expiresAt,
  };
}
