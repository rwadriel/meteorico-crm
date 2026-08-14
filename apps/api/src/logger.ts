import type { PinoLoggerOptions } from 'fastify/types/logger.js';

const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'body.password',
  'body.token',
  'body.secret',
  'body.phone',
];

export function createLogger(): PinoLoggerOptions {
  const isDev = process.env.NODE_ENV !== 'production';

  return {
    level: process.env.LOG_LEVEL ?? (isDev ? 'debug' : 'info'),
    redact: {
      paths: REDACT_PATHS,
      censor: '[REDACTED]',
    },
    serializers: {
      req(request: { method?: string; url?: string; remoteAddress?: string }) {
        return {
          method: request.method,
          url: sanitizeRequestUrl(request.url ?? ''),
          remoteAddress: request.remoteAddress,
        };
      },
    },
    ...(isDev
      ? {
          transport: {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'SYS:yyyy-mm-dd HH:MM:ss',
            },
          },
        }
      : {}),
  };
}

export function sanitizeRequestUrl(value: string): string {
  const queryIndex = value.indexOf('?');
  return queryIndex === -1 ? value : `${value.slice(0, queryIndex)}?[REDACTED]`;
}
