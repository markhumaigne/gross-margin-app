import { spawnSync } from 'node:child_process';
import { config } from 'dotenv';
import { Client } from 'pg';
import { testDatabase } from '../src/env';

config({ quiet: true });

/** Creates the test schema if missing, then applies migrations to it. Never resets or deletes. */
async function main(): Promise<void> {
  const { directUrl, schema } = testDatabase();

  // The only raw SQL here: it creates nothing but the (validated, non-public) test schema.
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(schema)) throw new Error('Invalid test schema name.');
  const url = new URL(directUrl);
  url.searchParams.delete('schema');
  const client = new Client({ connectionString: url.toString() });
  await client.connect();
  try {
    await client.query('CREATE SCHEMA IF NOT EXISTS "' + schema + '"');
  } finally {
    await client.end();
  }

  const result = spawnSync('npx prisma migrate deploy', {
    shell: true,
    stdio: 'inherit',
    env: { ...process.env, DIRECT_URL: directUrl },
  });
  if (result.status !== 0) throw new Error('prisma migrate deploy failed on the test schema.');
  console.log('Test schema "' + schema + '" is migrated.');
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
