import * as dotenv from 'dotenv';
import { Client } from 'pg';

/** Creates the isolated `<DB_NAME>_test` database so e2e never touches dev data. */
export default async function globalSetup(): Promise<void> {
  dotenv.config();
  const testDb = `${process.env.DB_NAME}_test`;
  if (!/^[a-z0-9_]+$/.test(testDb)) throw new Error('Unsafe test database name');

  const client = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT ?? 5432),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: 'postgres',
  });
  await client.connect();
  const exists = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [testDb]);
  if (!exists.rowCount) await client.query(`CREATE DATABASE "${testDb}"`);
  await client.end();
}
