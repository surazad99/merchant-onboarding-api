import { join } from 'path';
import { DataSourceOptions } from 'typeorm';
import { AuditLog } from '../audit/audit-log.entity';
import { MerchantApplication } from '../applications/merchant-application.entity';
import { RiskReview } from '../risk/risk-review.entity';
import { User } from '../users/user.entity';
import { SnakeNamingStrategy } from './snake-naming.strategy';

export function buildDbOptions(env: Record<string, string | undefined>): DataSourceOptions {
  return {
    type: 'postgres',
    host: env.DB_HOST,
    port: Number(env.DB_PORT ?? 5432),
    username: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    entities: [User, MerchantApplication, RiskReview, AuditLog],
    migrations: [join(__dirname, '..', 'migrations', '*{.ts,.js}')],
    migrationsRun: env.DB_RUN_MIGRATIONS === 'true',
    namingStrategy: new SnakeNamingStrategy(),
    uuidExtension: 'pgcrypto',
    synchronize: false, // schema is owned by reviewed migrations only
  };
}
