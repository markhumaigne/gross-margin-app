import { config } from 'dotenv';
import type { PrismaClient } from '../src/generated/prisma/client';
import { createPrismaClient } from '../src/database/prisma.service';
import { resetAndSeed } from '../src/database/seed';
import { testDatabase } from '../src/env';

config({ quiet: true });

/** A client for the test schema, reset to the demo seed. Refuses unless testDatabase() passes. */
export async function freshDb(): Promise<PrismaClient> {
  const db = createPrismaClient(testDatabase().databaseUrl);
  await resetAndSeed(db);
  return db;
}
