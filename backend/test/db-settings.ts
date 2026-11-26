import { config } from 'dotenv';
import { testDatabase } from '../src/env';

config({ quiet: true });

/**
 * The validated test database settings, captured once. test/db.ts later points DATABASE_URL at
 * the test database, after which testDatabase() would (correctly) refuse; everything reuses this.
 */
export const TEST_DB = testDatabase();
