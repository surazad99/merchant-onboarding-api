/** Fail fast at boot if configuration is missing or weak. */
export function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  const required = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME', 'REDIS_HOST', 'JWT_SECRET', 'FIELD_ENCRYPTION_KEY'];
  const missing = required.filter((k) => !config[k]);
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')} (run "npm run setup:env")`);
  }
  if (String(config.JWT_SECRET).length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters');
  }
  if (!/^[0-9a-fA-F]{64}$/.test(String(config.FIELD_ENCRYPTION_KEY))) {
    throw new Error('FIELD_ENCRYPTION_KEY must be 64 hex characters');
  }
  return config;
}
