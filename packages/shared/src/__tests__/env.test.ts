import { describe, it, expect, afterEach } from 'vitest';
import { requireEnv, optionalEnv, requireEnvNumber } from '../env.js';

describe('requireEnv', () => {
  const VAR_NAME = 'TEST_REQUIRE_ENV_VAR';

  afterEach(() => {
    delete process.env[VAR_NAME];
  });

  it('returns the value when the env var is set', () => {
    process.env[VAR_NAME] = 'hello';
    expect(requireEnv(VAR_NAME)).toBe('hello');
  });

  it('throws when the env var is missing', () => {
    expect(() => requireEnv(VAR_NAME)).toThrow(`Missing required environment variable: ${VAR_NAME}`);
  });

  it('throws when the env var is empty string', () => {
    process.env[VAR_NAME] = '';
    expect(() => requireEnv(VAR_NAME)).toThrow(`Missing required environment variable: ${VAR_NAME}`);
  });
});

describe('optionalEnv', () => {
  const VAR_NAME = 'TEST_OPTIONAL_ENV_VAR';

  afterEach(() => {
    delete process.env[VAR_NAME];
  });

  it('returns the value when set', () => {
    process.env[VAR_NAME] = 'value';
    expect(optionalEnv(VAR_NAME, 'default')).toBe('value');
  });

  it('returns the default when missing', () => {
    expect(optionalEnv(VAR_NAME, 'fallback')).toBe('fallback');
  });
});

describe('requireEnvNumber', () => {
  const VAR_NAME = 'TEST_REQUIRE_ENV_NUM';

  afterEach(() => {
    delete process.env[VAR_NAME];
  });

  it('returns a number when the value is numeric', () => {
    process.env[VAR_NAME] = '3000';
    expect(requireEnvNumber(VAR_NAME)).toBe(3000);
  });

  it('throws when the value is not a number', () => {
    process.env[VAR_NAME] = 'abc';
    expect(() => requireEnvNumber(VAR_NAME)).toThrow('must be a number');
  });

  it('throws when the env var is missing', () => {
    expect(() => requireEnvNumber(VAR_NAME)).toThrow('Missing required environment variable');
  });
});
