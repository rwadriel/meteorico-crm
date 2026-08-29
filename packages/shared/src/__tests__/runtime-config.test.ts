import { describe, expect, it } from 'vitest';
import { assertRuntimeConfig, validateRuntimeConfig } from '../runtime-config.js';

describe('runtime configuration', () => {
  it('does not require integration secrets while providers are disabled', () => {
    expect(validateRuntimeConfig('api', {
      WHATSAPP_PRIVATE_PROVIDER: 'mock',
      WHATSAPP_OUTBOUND_ENABLED: 'false',
    })).toEqual({ valid: true, missing: [], invalid: [] });
  });

  it('requires inbound Meta configuration when the API provider is enabled', () => {
    const result = validateRuntimeConfig('api', {
      WHATSAPP_PRIVATE_PROVIDER: 'meta_cloud',
      WHATSAPP_OUTBOUND_ENABLED: 'false',
      META_WHATSAPP_PHONE_NUMBER_ID: 'phone-id',
      META_WHATSAPP_WABA_ID: 'waba-id',
    });

    expect(result.valid).toBe(false);
    expect(result.missing).toEqual([
      'META_APP_SECRET',
      'META_WHATSAPP_ACCESS_TOKEN',
      'META_WHATSAPP_VERIFY_TOKEN',
    ]);
  });

  it('requires the staging allowlist only when outbound is enabled', () => {
    const result = validateRuntimeConfig('worker', {
      DEPLOYMENT_ENV: 'staging',
      WHATSAPP_PRIVATE_PROVIDER: 'meta_cloud',
      WHATSAPP_OUTBOUND_ENABLED: 'true',
      META_WHATSAPP_ACCESS_TOKEN: 'configured',
      META_WHATSAPP_PHONE_NUMBER_ID: 'phone-id',
      META_WHATSAPP_WABA_ID: 'waba-id',
    });

    expect(result.missing).toEqual(['WHATSAPP_STAGING_ALLOWLIST']);
  });

  it('rejects a partially configured Group Manager', () => {
    expect(validateRuntimeConfig('worker', {
      WHATSAPP_MANAGER_URL: 'https://manager.example.test',
    }).missing).toEqual(['WHATSAPP_MANAGER_INTEGRATION_TOKEN']);
  });

  it('reports variable names without including their values', () => {
    expect(() => assertRuntimeConfig('api', {
      WHATSAPP_PRIVATE_PROVIDER: 'unsupported-secret-value',
    })).toThrow('invalid: WHATSAPP_PRIVATE_PROVIDER');
  });
});
