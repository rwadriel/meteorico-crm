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
