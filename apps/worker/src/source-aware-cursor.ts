export const GROUP_MANAGER_INTEGRATION = 'whatsapp-manager';
export const PROVIDER_BASELINE_REQUIRED = 'provider_source_baseline_required';

export function assertProviderSourceId(value: unknown): string {
  if (
    typeof value !== 'string'
    || value.length < 12
    || value.length > 128
    || !/^[A-Za-z0-9._-]+$/.test(value)
  ) {
    throw new Error('WhatsApp Manager: invalid or missing source identity');
  }
  return value;
}

export function providerIntegrationKey(sourceId: string): string {
  return `${GROUP_MANAGER_INTEGRATION}:${assertProviderSourceId(sourceId)}`;
}

export function providerSourceFromIntegration(integration: string): string | null {
  const prefix = `${GROUP_MANAGER_INTEGRATION}:`;
  return integration.startsWith(prefix) ? integration.slice(prefix.length) : null;
}

export function requiresProviderBaseline(record: {
  lastPolledAt: Date | null;
  lastSuccessfulSnapshotAt: Date | null;
  lastProviderError: string | null;
} | null): boolean {
  return record === null
    || record.lastPolledAt === null
    || record.lastSuccessfulSnapshotAt === null
    || record.lastProviderError === PROVIDER_BASELINE_REQUIRED;
}
