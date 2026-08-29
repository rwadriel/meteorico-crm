export type RuntimeService = 'api' | 'worker';

export interface RuntimeConfigValidation {
  valid: boolean;
  missing: string[];
  invalid: string[];
}

/**
 * Validates only the integrations that are explicitly enabled. This keeps
 * development and disabled providers lightweight while making Meta outbound
 * and staging recipient protection fail closed.
 */
export function validateRuntimeConfig(
  service: RuntimeService,
  env: NodeJS.ProcessEnv = process.env,
): RuntimeConfigValidation {
  const missing = new Set<string>();
  const invalid = new Set<string>();
  const provider = (env.WHATSAPP_PRIVATE_PROVIDER ?? 'mock').toLowerCase();
  const deployment = (env.DEPLOYMENT_ENV ?? 'development').toLowerCase();
  const outbound = env.WHATSAPP_OUTBOUND_ENABLED === 'true';

  if (!['mock', 'meta_cloud'].includes(provider)) {
    invalid.add('WHATSAPP_PRIVATE_PROVIDER');
  }

  if (env.WHATSAPP_OUTBOUND_ENABLED !== undefined
    && !['true', 'false'].includes(env.WHATSAPP_OUTBOUND_ENABLED)) {
    invalid.add('WHATSAPP_OUTBOUND_ENABLED');
  }

  if (provider === 'meta_cloud') {
    for (const name of ['META_WHATSAPP_PHONE_NUMBER_ID', 'META_WHATSAPP_WABA_ID']) {
      if (!env[name]?.trim()) missing.add(name);
    }

    if (service === 'api') {
      for (const name of [
        'META_WHATSAPP_ACCESS_TOKEN',
        'META_WHATSAPP_VERIFY_TOKEN',
        'META_APP_SECRET',
      ]) {
        if (!env[name]?.trim()) missing.add(name);
      }
    }

    if (service === 'worker' && outbound && !env.META_WHATSAPP_ACCESS_TOKEN?.trim()) {
      missing.add('META_WHATSAPP_ACCESS_TOKEN');
    }
  }

  if (outbound && deployment === 'staging' && !env.WHATSAPP_STAGING_ALLOWLIST?.trim()) {
    missing.add('WHATSAPP_STAGING_ALLOWLIST');
  }

  const managerUrl = Boolean(env.WHATSAPP_MANAGER_URL?.trim());
  const managerToken = Boolean(env.WHATSAPP_MANAGER_INTEGRATION_TOKEN?.trim());
  if (service === 'worker' && managerUrl !== managerToken) {
    missing.add(managerUrl
      ? 'WHATSAPP_MANAGER_INTEGRATION_TOKEN'
      : 'WHATSAPP_MANAGER_URL');
  }

  return {
    valid: missing.size === 0 && invalid.size === 0,
    missing: [...missing].sort(),
    invalid: [...invalid].sort(),
  };
}

export function assertRuntimeConfig(
  service: RuntimeService,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const result = validateRuntimeConfig(service, env);
  if (result.valid) return;

  const details = [
    result.missing.length > 0 ? `missing: ${result.missing.join(', ')}` : '',
    result.invalid.length > 0 ? `invalid: ${result.invalid.join(', ')}` : '',
  ].filter(Boolean).join('; ');
  throw new Error(`Invalid ${service} runtime configuration (${details})`);
}
