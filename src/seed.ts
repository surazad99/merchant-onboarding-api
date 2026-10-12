import 'dotenv/config';
import * as bcrypt from 'bcryptjs';
import dataSource from './data-source';

/** Local demo users. Password comes from SEED_PASSWORD in your (git-ignored) .env. */
const USERS = [
  { email: 'admin@example.test', fullName: 'Demo Admin', role: 'ADMIN' },
  { email: 'reviewer@example.test', fullName: 'Demo Reviewer', role: 'REVIEWER' },
  { email: 'sales1@example.test', fullName: 'Demo Sales One', role: 'SALES' },
  { email: 'sales2@example.test', fullName: 'Demo Sales Two', role: 'SALES' },
];

async function main() {
  const password = process.env.SEED_PASSWORD;
  if (!password || password.length < 12) {
    throw new Error('Set SEED_PASSWORD (min 12 chars) in .env - run "npm run setup:env"');
  }
  await dataSource.initialize();
  await dataSource.runMigrations();
  const hash = await bcrypt.hash(password, Number(process.env.BCRYPT_ROUNDS ?? 12));
  for (const u of USERS) {
    await dataSource.query(
      `INSERT INTO users (email, password_hash, full_name, role) VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO NOTHING`,
      [u.email, hash, u.fullName, u.role],
    );
    console.log(`seeded ${u.role.padEnd(8)} ${u.email}`);
  }
  console.log('Password for all demo users: the SEED_PASSWORD value in your .env');
  await dataSource.destroy();
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
