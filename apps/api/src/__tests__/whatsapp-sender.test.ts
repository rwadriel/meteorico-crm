import { describe, expect, it } from 'vitest';
import { normalizeSenderStatus } from '../services/whatsapp-sender.js';

describe('WhatsApp sender status', () => {
  it('keeps the configured production number connected', () => {
    expect(normalizeSenderStatus({ id: 'phone-main' }, 'phone-main')).toBe('CONNECTED');
  });

  it('uses Meta status when supplied and otherwise remains pending', () => {
    expect(normalizeSenderStatus({ id: 'phone-2', status: 'connected' }, 'phone-main')).toBe(
      'CONNECTED',
    );
    expect(normalizeSenderStatus({ id: 'phone-3' }, 'phone-main')).toBe('PENDING');
  });
});
