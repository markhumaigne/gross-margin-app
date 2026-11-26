import { execSync } from 'node:child_process';
import { config } from 'dotenv';
import { testDatabase } from '../backend/src/env';

export default function globalSetup(): void {
  config({ path: 'backend/.env', quiet: true });
  testDatabase(); // refuses to continue unless the test schema is configured
  execSync('npm run db:test:prepare -w backend', { stdio: 'inherit' });
}
