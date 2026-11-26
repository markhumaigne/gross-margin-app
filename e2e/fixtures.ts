import { config } from 'dotenv';
import { test as base, expect } from '@playwright/test';
import { createPrismaClient } from '../backend/src/database/prisma.service';
import { resetAndSeed } from '../backend/src/database/seed';
import { testDatabase } from '../backend/src/env';
import type { PrismaClient } from '../backend/src/generated/prisma/client';

config({ path: 'backend/.env', quiet: true });

export const test = base.extend<{ resetDatabase: void }, { testDb: PrismaClient }>({
  testDb: [
    async ({}, use) => {
      const db = createPrismaClient(testDatabase().databaseUrl);
      await use(db);
      await db.$disconnect();
    },
    { scope: 'worker' },
  ],
  resetDatabase: [
    async ({ testDb }, use) => {
      await resetAndSeed(testDb);
      await use();
    },
    { auto: true },
  ],
});

export { expect };
export type { Download, Locator, Page } from '@playwright/test';
