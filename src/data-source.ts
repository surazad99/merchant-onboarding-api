import 'dotenv/config';
import { DataSource } from 'typeorm';
import { buildDbOptions } from './config/database.config';

/** Used by the TypeORM CLI (migration:run / migration:revert) and the seed script. */
export default new DataSource(buildDbOptions(process.env));
