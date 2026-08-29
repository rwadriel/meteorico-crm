import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@prisma/client', () => {
  const MockPrismaClient = vi.fn().mockImplementation(() => ({
    $connect: vi.fn(),
    $disconnect: vi.fn(),
  }));
  return { PrismaClient: MockPrismaClient };
});

describe('client', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('getClient returns a PrismaClient instance', async () => {
    const { getClient } = await import('../client.js');
    const client = getClient();
    expect(client).toBeDefined();
    expect(client).toHaveProperty('$connect');
    expect(client).toHaveProperty('$disconnect');
  });

  it('getClient returns the same instance on subsequent calls', async () => {
    const { getClient } = await import('../client.js');
    const client1 = getClient();
    const client2 = getClient();
    expect(client1).toBe(client2);
  });

  it('disconnect clears the singleton', async () => {
    const { getClient, disconnect } = await import('../client.js');
    const client1 = getClient();
    expect(client1).toBeDefined();
    await disconnect();
    const client2 = getClient();
    expect(client2).not.toBe(client1);
  });
});
