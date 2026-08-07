import { describe, it, expect } from 'vitest';
import { buildApp } from '../app.js';

describe('Health Routes', () => {
  it('GET /health returns healthy status', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe('healthy');
    expect(body.service).toBe('meteorico-crm-api');
    expect(body.version).toBe('0.1.0');
    expect(body.timestamp).toBeDefined();
    expect(body.uptime).toBeGreaterThanOrEqual(0);
    await app.close();
  });

  it('GET /readiness returns readiness status', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'GET',
      url: '/readiness',
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.ready).toBe(true);
    await app.close();
  });
});
