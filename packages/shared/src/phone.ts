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
