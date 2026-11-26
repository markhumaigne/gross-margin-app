// Must stay first: the time zone and database settings apply to everything imported below.
import { config } from 'dotenv';
config({ quiet: true });
process.env.TZ = 'Asia/Manila';

import { testDatabase } from '../src/env';
process.env['DATABASE_URL'] = testDatabase().databaseUrl;
process.env['AUTH_SECRET'] ||= 'test-secret-test-secret-test-secret-123';

import { runAll } from './harness';
import './db-schema';

void runAll().then(() => process.exit(process.exitCode ?? 0));
