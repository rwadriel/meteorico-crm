/**
 * Returns the value of an environment variable or throws if it is not set.
 */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * Returns the value of an environment variable or a default value.
 */
export function optionalEnv(name: string, defaultValue: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    return defaultValue;
  }
  return value;
}

/**
 * Returns the numeric value of an environment variable or throws if missing or non-numeric.
 */
export function requireEnvNumber(name: string): number {
  const raw = requireEnv(name);
  const num = Number(raw);
  if (Number.isNaN(num)) {
    throw new Error(`Environment variable ${name} must be a number, got: ${raw}`);
  }
  return num;
}
