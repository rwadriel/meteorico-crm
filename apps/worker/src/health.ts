import http from 'node:http';
import { createWorkerLogger } from './logger.js';

const logger = createWorkerLogger();

export function startHealthServer(port = 4081): http.Server {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'healthy',
      service: 'meteorico-crm-worker',
      version: '0.1.0',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    }));
  });

  server.listen(port, () => {
    logger.info({ port }, 'Worker health server listening');
  });

  return server;
}
