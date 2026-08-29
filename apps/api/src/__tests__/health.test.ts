import { describe, it, expect } from 'vitest';
import { buildApp } from '../app.js';
import { getReadinessStatus } from '../routes/health.js';

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
    expect(body.checks).toEqual({ database: 'ok', redis: 'ok' });
    expect(body.integrations.meta.outboundEnabled).toBe(false);
    await app.close();
  });

  it('keeps liveness separate from unavailable core dependencies', async () => {
    const result = await getReadinessStatus({
      database: async () => { throw new Error('database unavailable'); },
      redis: async () => { throw new Error('redis unavailable'); },
      groupManager: async () => ({ status: 'healthy', connected: true, snapshotFresh: true }),
    });

    expect(result.ready).toBe(false);
    expect(result.checks).toEqual({ database: 'error', redis: 'error' });
    expect(result.integrations.groupManager.status).toBe('error');
  });
});
