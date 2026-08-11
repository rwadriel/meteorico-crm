import { describe, it, expect } from 'vitest';
import { normalizePhone, normalizeWhatsAppPhone, maskPhone } from '../phone.js';

describe('normalizePhone', () => {
  it('normalizes a valid Brazilian mobile number with country code', () => {
    expect(normalizePhone('5591988889999')).toBe('5591988889999');
  });

  it('normalizes a number with formatting characters', () => {
    expect(normalizePhone('+55 (91) 98888-9999')).toBe('5591988889999');
  });

  it('adds country code 55 when missing (11 digits)', () => {
    expect(normalizePhone('91988889999')).toBe('5591988889999');
  });

  it('adds country code 55 when missing (10 digits, landline)', () => {
    expect(normalizePhone('9133334444')).toBe('559133334444');
  });

  it('returns null for input that is too short', () => {
    expect(normalizePhone('12345')).toBeNull();
  });

  it('returns null for input that is too long', () => {
    expect(normalizePhone('55919888899991234')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(normalizePhone('')).toBeNull();
  });

  it('returns null for non-numeric input', () => {
    expect(normalizePhone('abc')).toBeNull();
  });
});

describe('normalizeWhatsAppPhone', () => {
  it('canonicalizes the Meta wa_id form of a Brazilian mobile number', () => {
    expect(normalizeWhatsAppPhone('559193111778')).toBe('5591993111778');
    expect(normalizeWhatsAppPhone('+55 (91) 99311-1778')).toBe('5591993111778');
  });

  it('does not insert a ninth digit into a Brazilian landline', () => {
    expect(normalizeWhatsAppPhone('559133334444')).toBe('559133334444');
  });
});

describe('maskPhone', () => {
  it('masks middle digits of a 13-digit number', () => {
    expect(maskPhone('5591988889999')).toBe('5591*****9999');
  });

  it('masks middle digits of a 12-digit number', () => {
    expect(maskPhone('559133334444')).toBe('5591****4444');
  });

  it('handles short input gracefully', () => {
    expect(maskPhone('12345')).toBe('12345');
  });
});
