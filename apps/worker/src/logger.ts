import pino from 'pino';

const REDACT_PATHS = [
  'token',
  'password',
  'secret',
  'phone',
  'authorization',
  'inviteLink',
  'payload',
  'rawPayload',
  'participants[*].number',
];

export function createWorkerLogger() {
  const isDev = process.env.NODE_ENV !== 'production';

  return pino({
    name: 'meteorico-worker',
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
  });
}
