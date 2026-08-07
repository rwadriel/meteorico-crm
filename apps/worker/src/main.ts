import { createWorkerLogger } from './logger.js';

const logger = createWorkerLogger();

async function start(): Promise<void> {
  logger.info('Meteórico CRM Worker starting...');

  logger.info({
    pollingInterval: process.env.WORKER_POLLING_INTERVAL_MS ?? '10000',
    nodeEnv: process.env.NODE_ENV ?? 'development',
  }, 'Worker configuration loaded');

  logger.info('Worker ready — awaiting job implementations (Etapa 05+)');

  // Keep process alive
  const keepAlive = setInterval(() => {
    logger.debug('Worker heartbeat');
  }, 30_000);

  const shutdown = (signal: string) => {
    logger.info({ signal }, 'Worker shutting down');
    clearInterval(keepAlive);
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start().catch((err) => {
  logger.fatal(err, 'Worker failed to start');
  process.exit(1);
});
