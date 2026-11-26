import bcrypt from 'bcryptjs';
import type { PrismaClient } from '../generated/prisma/client';
import { PRODUCTS } from '../../../shared/seed/products';
import { SEED_PRICE_BOOKS } from '../../../shared/seed/price-books';
import { SEED_USERS } from '../../../shared/seed/users';
import { bookToRows, productToRow } from './mappers';

const BCRYPT_COST = 12;
let hashed: Promise<string[]> | undefined;

/** Hashes once per process: cost 12 is deliberately slow and tests reseed before every test. */
const seedHashes = (): Promise<string[]> =>
  (hashed ??= Promise.all(SEED_USERS.map((u) => bcrypt.hash(u.password, BCRYPT_COST))));

async function insertSeed(db: PrismaClient): Promise<void> {
  const hashes = await seedHashes();
  await db.user.createMany({
    data: SEED_USERS.map((u, i) => ({
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      passwordHash: hashes[i],
      role: u.role,
      active: u.active,
    })),
  });
  await db.product.createMany({ data: PRODUCTS.map(productToRow) });
  const rows = SEED_PRICE_BOOKS.map(bookToRows);
  await db.priceBook.createMany({ data: rows.map((r) => r.book) });
  await db.priceBookEntry.createMany({ data: rows.flatMap((r) => r.entries) });
}

/** Seeds the demo data only into an empty database; existing accounts are never touched. */
export async function seedIfEmpty(db: PrismaClient): Promise<'seeded' | 'skipped'> {
  if ((await db.user.count()) > 0) return 'skipped';
  await insertSeed(db);
  return 'seeded';
}

/** Test schema only: callers must have passed testDatabase(). Prisma queries, never TRUNCATE. */
export async function resetAndSeed(db: PrismaClient): Promise<void> {
  await db.priceBookEntry.deleteMany();
  await db.priceBook.deleteMany();
  await db.product.deleteMany();
  await db.user.deleteMany();
  await insertSeed(db);
}
