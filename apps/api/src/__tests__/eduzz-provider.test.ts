import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  MockEduzzProvider,
  HmacEduzzProvider,
  createEduzzProvider,
} from '../services/eduzz.js';
import { createHmac } from 'node:crypto';

describe('MockEduzzProvider', () => {
  it('always returns true for signature verification', () => {
    const provider = new MockEduzzProvider();
    expect(provider.verifySignature({}, 'any')).toBe(true);
    expect(provider.name).toBe('eduzz-mock');
  });
});

describe('HmacEduzzProvider', () => {
  const secret = 'test-secret-key';

  it('verifies a valid HMAC signature', () => {
    const provider = new HmacEduzzProvider(secret);
    const payload = { sale_id: '123', product_id: 'p1' };
    const body = JSON.stringify(payload);
    const signature = createHmac('sha256', secret).update(body).digest('hex');

    expect(provider.verifySignature(payload, signature)).toBe(true);
  });

  it('rejects an invalid signature', () => {
    const provider = new HmacEduzzProvider(secret);
    const payload = { sale_id: '123' };
    expect(provider.verifySignature(payload, 'invalid-signature')).toBe(false);
  });

  it('rejects a tampered payload', () => {
    const provider = new HmacEduzzProvider(secret);
    const original = { sale_id: '123' };
    const body = JSON.stringify(original);
    const signature = createHmac('sha256', secret).update(body).digest('hex');

    const tampered = { sale_id: '456' };
    expect(provider.verifySignature(tampered, signature)).toBe(false);
  });

  it('has correct name', () => {
    const provider = new HmacEduzzProvider(secret);
    expect(provider.name).toBe('eduzz');
  });
});

describe('createEduzzProvider', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('returns MockEduzzProvider in test environment', () => {
    process.env.NODE_ENV = 'test';
    delete process.env.EDUZZ_WEBHOOK_SECRET;
    const provider = createEduzzProvider();
    expect(provider.name).toBe('eduzz-mock');
  });

  it('throws when secret is missing in production', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.EDUZZ_WEBHOOK_SECRET;
    expect(() => createEduzzProvider()).toThrow('EDUZZ_WEBHOOK_SECRET is required');
  });

  it('throws when secret is missing in staging', () => {
    process.env.NODE_ENV = 'staging';
    delete process.env.EDUZZ_WEBHOOK_SECRET;
    expect(() => createEduzzProvider()).toThrow('EDUZZ_WEBHOOK_SECRET is required');
  });

  it('returns HmacEduzzProvider when secret is set', () => {
    process.env.NODE_ENV = 'production';
    process.env.EDUZZ_WEBHOOK_SECRET = 'prod-secret';
    const provider = createEduzzProvider();
    expect(provider.name).toBe('eduzz');
  });
});
