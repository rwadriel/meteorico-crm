import { describe, expect, it } from 'vitest';
import { sanitizeRequestUrl } from '../logger.js';

describe('request log redaction', () => {
  it('removes webhook verification tokens and every other query value', () => {
    expect(sanitizeRequestUrl(
      '/webhooks/whatsapp/meta?hub.verify_token=secret&hub.challenge=challenge',
    )).toBe('/webhooks/whatsapp/meta?[REDACTED]');
  });

  it('preserves paths without a query string', () => {
    expect(sanitizeRequestUrl('/health')).toBe('/health');
  });
});
