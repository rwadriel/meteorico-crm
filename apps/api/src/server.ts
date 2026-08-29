import { buildApp } from './app.js';

const PORT = parseInt(process.env.API_PORT ?? '4080', 10);
const HOST = process.env.API_HOST ?? '0.0.0.0';

async function start(): Promise<void> {
  const app = await buildApp();

  try {
    await app.listen({ port: PORT, host: HOST });
    app.log.info({ port: PORT, host: HOST }, 'Meteorico CRM API started');
  } catch (err) {
    app.log.fatal(err, 'Failed to start API');
    process.exit(1);
  }

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'Shutting down');
    await app.close();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start();
