import { describe, it, expect } from 'vitest';
import { createCampaignSchema, updateCampaignSchema } from '../schemas/campaign.js';

describe('createCampaignSchema', () => {
  it('accepts valid data with new fields', () => {
    const result = createCampaignSchema.parse({
      name: 'Campanha 50',
      slug: 'campanha-50',
      timezone: 'America/Sao_Paulo',
      captationStartsAt: '2026-08-10T10:00:00.000Z',
      startsAt: '2026-08-12T10:00:00.000Z',
      endsAt: '2026-08-14T23:59:00.000Z',
    });
    expect(result.timezone).toBe('America/Sao_Paulo');
    expect(result.captationStartsAt).toBe('2026-08-10T10:00:00.000Z');
  });

  it('defaults timezone to America/Sao_Paulo', () => {
    const result = createCampaignSchema.parse({
      name: 'Test',
      slug: 'test',
    });
    expect(result.timezone).toBe('America/Sao_Paulo');
  });

  it('rejects invalid timezone', () => {
    expect(() => createCampaignSchema.parse({
      name: 'Test',
      slug: 'test',
      timezone: 'Invalid/Zone',
    })).toThrow();
  });

  it('accepts captationStartsAt as null', () => {
    const result = createCampaignSchema.parse({
      name: 'Test',
      slug: 'test',
      captationStartsAt: null,
    });
    expect(result.captationStartsAt).toBeNull();
  });

  it('accepts valid IANA timezone names', () => {
    for (const tz of ['America/Belem', 'UTC', 'Europe/London', 'Asia/Tokyo']) {
      const result = createCampaignSchema.parse({
        name: 'Test',
        slug: 'test',
        timezone: tz,
      });
      expect(result.timezone).toBe(tz);
    }
  });
});

describe('updateCampaignSchema', () => {
  it('accepts timezone update', () => {
    const result = updateCampaignSchema.parse({ timezone: 'America/Belem' });
    expect(result.timezone).toBe('America/Belem');
  });

  it('accepts captationStartsAt update', () => {
    const result = updateCampaignSchema.parse({
      captationStartsAt: '2026-08-10T10:00:00.000Z',
    });
    expect(result.captationStartsAt).toBe('2026-08-10T10:00:00.000Z');
  });
});
