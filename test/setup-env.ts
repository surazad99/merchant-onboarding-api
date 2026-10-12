import * as dotenv from 'dotenv';

dotenv.config(); // values from .env (or CI-provided env vars)

if (!process.env.DB_NAME?.endsWith('_test')) process.env.DB_NAME = `${process.env.DB_NAME}_test`;
Object.assign(process.env, {
  NODE_ENV: 'test',
  DB_RUN_MIGRATIONS: 'true',
  BCRYPT_ROUNDS: '4',
  RISK_SIMULATED_FAILURE_RATE: '0',
  RISK_MAX_ATTEMPTS: '3',
  RISK_BACKOFF_MS: '50',
  BULL_PREFIX: `bull-test-${Date.now()}`, // isolate queue keys per run
});
