import { normalizePhone, parseStagingAllowlist } from '@meteorico/shared';

export function normalizeAllowedManagerPhone(phone: string | null | undefined): string | null {
  const normalized = normalizePhone(phone ?? '');
  if (!normalized) return null;

  if ((process.env.DEPLOYMENT_ENV ?? 'development').toLowerCase() !== 'staging') {
    return normalized;
  }

  const allowlist = parseStagingAllowlist(process.env.WHATSAPP_STAGING_ALLOWLIST);
  return allowlist.has(normalized) ? normalized : null;
}
