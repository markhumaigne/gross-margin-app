import { config } from 'dotenv';
import { createPrismaClient } from '../src/database/prisma.service';
import { seedIfEmpty } from '../src/database/seed';

config({ quiet: true });

async function main(): Promise<void> {
  const url = process.env['DIRECT_URL'];
  if (!url) throw new Error('DIRECT_URL is not set. Add it to backend/.env.');
  const db = createPrismaClient(url);
  try {
    const outcome = await seedIfEmpty(db);
    console.log(
      outcome === 'seeded'
        ? 'Seeded demo accounts, products and price books.'
        : 'Database already has accounts; seed skipped.',
    );
  } finally {
    await db.$disconnect();
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
