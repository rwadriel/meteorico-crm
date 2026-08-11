/**
 * Strips non-digit characters and normalizes to E.164 format for Brazil.
 * Returns null if the input is invalid.
 */
export function normalizePhone(input: string): string | null {
  const digits = input.replace(/\D/g, '');

  if (digits.length < 10 || digits.length > 13) {
    return null;
  }

  // Already has country code 55
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    return digits;
  }

  // DDD + number without country code (10 or 11 digits)
  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`;
  }

  return null;
}

/**
 * Canonicalizes Brazilian WhatsApp identities to the current mobile E.164 form.
 *
 * Meta can deliver a Brazilian mobile wa_id without the ninth digit. We only
 * insert it for a 12-digit Brazilian identity whose local number starts in the
 * mobile range (6-9). Landlines and non-Brazilian numbers remain unchanged.
 */
export function normalizeWhatsAppPhone(input: string): string | null {
  const normalized = normalizePhone(input);
  if (!normalized) return null;

  if (/^55\d{2}[6-9]\d{7}$/.test(normalized)) {
    return `${normalized.slice(0, 4)}9${normalized.slice(4)}`;
  }

  return normalized;
}

/**
 * Masks middle digits for logging purposes.
 * Example: 5591988889999 → 5591****9999
 */
export function maskPhone(phone: string): string {
  if (phone.length < 8) {
    return phone;
  }

  const prefix = phone.slice(0, 4);
  const suffix = phone.slice(-4);
  const maskedLength = phone.length - 8;

  return `${prefix}${'*'.repeat(maskedLength > 0 ? maskedLength : 4)}${suffix}`;
}
