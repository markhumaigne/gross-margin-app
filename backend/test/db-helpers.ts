import { config } from 'dotenv';
import type { PrismaClient } from '../src/generated/prisma/client';
import { createPrismaClient } from '../src/database/prisma.service';
import { resetAndSeed } from '../src/database/seed';
import { TEST_DB } from './db-settings';

config({ quiet: true });

/** A client for the test schema, reset to the demo seed. Refuses unless testDatabase() passes. */
export async function freshDb(): Promise<PrismaClient> {
  const db = createPrismaClient(TEST_DB.databaseUrl);
  await resetAndSeed(db);
  return db;
}
