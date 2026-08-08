import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import { csrfProtection } from '../middleware/csrf.js';

describe('CSRF protection', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.API_CORS_ORIGINS = 'http://localhost:5173,https://app.meteorico.dev';

    app = Fastify({ logger: false });
    await app.register(cookie);
    await csrfProtection(app);

    app.get('/api/test', async () => ({ ok: true }));
    app.post('/api/test', async () => ({ ok: true }));
    app.put('/api/test', async () => ({ ok: true }));
    app.patch('/api/test', async () => ({ ok: true }));
    app.delete('/api/test', async () => ({ ok: true }));
    app.post('/auth/login', async () => ({ ok: true }));
    app.post('/webhook/eduzz', async () => ({ ok: true }));
    app.post('/webhook/messaging', async () => ({ ok: true }));
    app.post('/api/upload', async () => ({ ok: true }));

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    delete process.env.API_CORS_ORIGINS;
  });

  it('allows GET requests without Origin header', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/test' });
    expect(res.statusCode).toBe(200);
  });

  it('allows POST with valid Origin header', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/test',
      headers: { origin: 'http://localhost:5173', 'content-type': 'application/json' },
      payload: {},
    });
    expect(res.statusCode).toBe(200);
  });

  it('allows PUT with valid Origin header', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/test',
      headers: { origin: 'https://app.meteorico.dev', 'content-type': 'application/json' },
      payload: {},
    });
    expect(res.statusCode).toBe(200);
  });

  it('allows JSON POST without Origin (same-origin API call)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/test',
      headers: { 'content-type': 'application/json' },
      payload: {},
    });
    expect(res.statusCode).toBe(200);
  });

  it('rejects POST with wrong Origin', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/test',
      headers: { origin: 'https://evil.com', 'content-type': 'application/json' },
      payload: {},
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().message).toContain('Origin not allowed');
  });

  it('rejects DELETE with cross-origin', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/test',
      headers: { origin: 'https://attacker.example.com' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('allows empty POST without Origin or Content-Type (API call, not a form)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/test',
    });
    expect(res.statusCode).toBe(200);
  });

  it('rejects multipart/form-data POST without Origin (form submission attack)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/upload',
      headers: { 'content-type': 'multipart/form-data; boundary=---' },
      payload: '-----\r\nContent-Disposition: form-data; name="file"\r\n\r\ndata\r\n-------',
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().message).toContain('Origin header required');
  });

  it('rejects text/plain POST without Origin', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/test',
      headers: { 'content-type': 'text/plain' },
      payload: 'some data',
    });
    expect(res.statusCode).toBe(403);
  });

  it('rejects form-urlencoded POST without Origin', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/test',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'key=value',
    });
    expect(res.statusCode).toBe(403);
  });

  it('falls back to Referer header when Origin is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/test',
      headers: { referer: 'http://localhost:5173/campaigns', 'content-type': 'application/json' },
      payload: {},
    });
    expect(res.statusCode).toBe(200);
  });

  it('rejects Referer from wrong origin', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/test',
      headers: { referer: 'https://evil.com/page', 'content-type': 'application/json' },
      payload: {},
    });
    expect(res.statusCode).toBe(403);
  });

  it('exempts /auth/login from CSRF check', async () => {
    const res = await app.inject({ method: 'POST', url: '/auth/login' });
    expect(res.statusCode).toBe(200);
  });

  it('exempts /webhook/eduzz from CSRF check', async () => {
    const res = await app.inject({ method: 'POST', url: '/webhook/eduzz' });
    expect(res.statusCode).toBe(200);
  });

  it('exempts /webhook/messaging from CSRF check', async () => {
    const res = await app.inject({ method: 'POST', url: '/webhook/messaging' });
    expect(res.statusCode).toBe(200);
  });
});
