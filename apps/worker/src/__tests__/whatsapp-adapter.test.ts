import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WhatsAppManagerReadProvider } from '../adapters/whatsapp-manager.js';

const SOURCE_ID = 'wm-stream-11111111-1111-4111-8111-111111111111';

describe('WhatsAppManagerReadProvider', () => {
  let provider: WhatsAppManagerReadProvider;

  beforeEach(() => {
    provider = new WhatsAppManagerReadProvider('https://wm.example.com', 'test-token');
    vi.restoreAllMocks();
  });

  it('calls health endpoint', async () => {
    const mockResponse = { sourceId: SOURCE_ID, ok: true, lastSeq: 42, events: 100 };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockResponse), { status: 200 }),
    );

    const result = await provider.health();
    expect(result).toEqual(mockResponse);
    expect(fetch).toHaveBeenCalledWith(
      'https://wm.example.com/api/integration/health',
      expect.objectContaining({ headers: { Authorization: 'Bearer test-token' } }),
    );
  });

  it('calls events endpoint with since and limit', async () => {
    const mockResponse = { sourceId: SOURCE_ID, events: [], nextSince: 10, hasMore: false, lastSeq: 42 };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockResponse), { status: 200 }),
    );

    const result = await provider.events(5, 100);
    expect(result).toEqual(mockResponse);
    expect(fetch).toHaveBeenCalledWith(
      'https://wm.example.com/api/integration/events?since=5&limit=100',
      expect.objectContaining({ headers: { Authorization: 'Bearer test-token' } }),
    );
  });

  it('calls snapshots endpoint with optional groupId', async () => {
    const mockResponse = { sourceId: SOURCE_ID, groups: [] };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockResponse), { status: 200 }),
    );

    await provider.snapshots('group-123');
    expect(fetch).toHaveBeenCalledWith(
      'https://wm.example.com/api/integration/snapshots?groupId=group-123',
      expect.objectContaining({ headers: { Authorization: 'Bearer test-token' } }),
    );
  });

  it('calls snapshots endpoint without groupId', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ sourceId: SOURCE_ID, groups: [] }), { status: 200 }),
    );

    await provider.snapshots();
    expect(fetch).toHaveBeenCalledWith(
      'https://wm.example.com/api/integration/snapshots',
      expect.objectContaining({ headers: { Authorization: 'Bearer test-token' } }),
    );
  });

  it('throws on 401 unauthorized', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Unauthorized', { status: 401 }),
    );

    await expect(provider.health()).rejects.toThrow('unauthorized');
  });

  it('throws on 503 not configured', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Not configured', { status: 503 }),
    );

    await expect(provider.health()).rejects.toThrow('not configured');
  });

  it('throws on generic HTTP error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Bad Request', { status: 400 }),
    );

    await expect(provider.health()).rejects.toThrow('HTTP 400');
  });

  it('strips trailing slash from baseUrl', async () => {
    const p = new WhatsAppManagerReadProvider('https://wm.example.com/', 'tok');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ sourceId: SOURCE_ID, ok: true, lastSeq: 0, events: 0 }), { status: 200 }),
    );

    await p.health();
    expect(fetch).toHaveBeenCalledWith(
      'https://wm.example.com/api/integration/health',
      expect.any(Object),
    );
  });

  it('uses default limit of 2000 for events', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ sourceId: SOURCE_ID, events: [], nextSince: 0, hasMore: false, lastSeq: 0 }), { status: 200 }),
    );

    await provider.events(0);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('limit=2000'),
      expect.any(Object),
    );
  });

  it('fails closed when the provider omits its source identity', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true, lastSeq: 0, events: 0 }), { status: 200 }),
    );

    await expect(provider.health()).rejects.toThrow('invalid or missing source identity');
  });
});
