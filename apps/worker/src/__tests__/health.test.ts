import { describe, it, expect } from 'vitest';
import { startHealthServer } from '../health.js';

describe('Worker Health', () => {
  it('health server responds with status', async () => {
    const server = startHealthServer(0);
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;

    const response = await fetch(`http://localhost:${port}/`);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe('healthy');
    expect(body.service).toBe('meteorico-crm-worker');

    server.close();
  });
});
