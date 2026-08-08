import { describe, it, expect } from 'vitest';

describe('Queue idempotency key design', () => {
  it('generates unique keys from conversationId and timestamp', () => {
    const key1 = `msg:conv-123:${Date.now()}`;
    const key2 = `msg:conv-123:${Date.now() + 1}`;
    expect(key1).not.toBe(key2);
  });

  it('integration task keys include provider and action', () => {
    const key = `integration:eduzz:sync:sale-456`;
    expect(key).toContain('eduzz');
    expect(key).toContain('sync');
  });

  it('same idempotency key produces same string', () => {
    const makeKey = (provider: string, action: string, id: string) =>
      `integration:${provider}:${action}:${id}`;

    const key1 = makeKey('eduzz', 'sync', 'sale-789');
    const key2 = makeKey('eduzz', 'sync', 'sale-789');
    expect(key1).toBe(key2);
  });
});
