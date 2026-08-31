import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const EXEMPT_PATHS = new Set([
  '/auth/login',
  '/webhook/eduzz',
  '/webhook/messaging',
  '/webhooks/whatsapp/meta',
  '/health',
  '/readiness',
]);
const FORM_CONTENT_TYPES = [
  'application/x-www-form-urlencoded',
  'multipart/form-data',
  'text/plain',
];

function getAllowedOrigins(): string[] {
  return (process.env.API_CORS_ORIGINS ?? 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean);
}

function isExempt(path: string): boolean {
  return EXEMPT_PATHS.has(path) || path.startsWith('/r/') || path.startsWith('/docs');
}

function extractOrigin(request: FastifyRequest): string | null {
  const origin = request.headers['origin'];
  if (origin) return origin;

  const referer = request.headers['referer'];
  if (referer) {
    try {
      const url = new URL(referer);
      return url.origin;
    } catch {
      return null;
    }
  }

  return null;
}

function isFormContentType(request: FastifyRequest): boolean {
  const ct = (request.headers['content-type'] ?? '').toLowerCase();
  return FORM_CONTENT_TYPES.some((t) => ct.startsWith(t));
}

export async function csrfProtection(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    if (SAFE_METHODS.has(request.method)) return;
    if (isExempt(request.url.split('?')[0])) return;

    const origin = extractOrigin(request);

    if (origin) {
      const allowed = getAllowedOrigins();
      const normalizedOrigin = origin.replace(/\/$/, '');
      if (!allowed.includes(normalizedOrigin)) {
        request.log.warn(
          { origin, method: request.method, url: request.url },
          'CSRF: origin rejected',
        );
        return reply.status(403).send({ error: 'Forbidden', message: 'Origin not allowed' });
      }
      return;
    }

    if (isFormContentType(request)) {
      request.log.warn(
        { method: request.method, url: request.url },
        'CSRF: form content-type without Origin',
      );
      return reply
        .status(403)
        .send({ error: 'Forbidden', message: 'Origin header required for form submissions' });
    }
  });
}
