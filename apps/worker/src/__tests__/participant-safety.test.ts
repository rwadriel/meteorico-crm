import { afterEach, describe, expect, it } from 'vitest';
import { normalizeAllowedManagerPhone } from '../participant-safety.js';

const originalEnvironment = process.env.DEPLOYMENT_ENV;
const originalAllowlist = process.env.WHATSAPP_STAGING_ALLOWLIST;

afterEach(() => {
  restoreEnv('DEPLOYMENT_ENV', originalEnvironment);
  restoreEnv('WHATSAPP_STAGING_ALLOWLIST', originalAllowlist);
});

describe('normalizeAllowedManagerPhone', () => {
  it('matches the Meta wa_id alias to the single controlled staging recipient', () => {
    process.env.DEPLOYMENT_ENV = 'staging';
    process.env.WHATSAPP_STAGING_ALLOWLIST = '5591993111778';

    expect(normalizeAllowedManagerPhone('559193111778')).toBe('5591993111778');
    expect(normalizeAllowedManagerPhone('559188887777')).toBeNull();
  });
});

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
