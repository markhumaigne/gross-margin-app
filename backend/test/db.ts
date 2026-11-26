// Must stay first: the time zone and database settings apply to everything imported below.
import { config } from 'dotenv';
config({ quiet: true });
process.env.TZ = 'Asia/Manila';

// Captured before DATABASE_URL is overwritten below: testDatabase() would then refuse it.
import { TEST_DB } from './db-settings';
process.env['DATABASE_URL'] = TEST_DB.databaseUrl;
process.env['AUTH_SECRET'] ||= 'test-secret-test-secret-test-secret-123';

import { runAll } from './harness';
import './db-schema';
import './db-calculation';
import './db-auth';
import './db-accounts';
import './db-pricing';

void runAll().then(() => process.exit(process.exitCode ?? 0));
