import bcrypt from 'bcryptjs';
import type { Prisma, PrismaClient } from '../generated/prisma/client';
import { PRODUCTS } from '../../../shared/seed/products';
import { SEED_PRICE_BOOKS } from '../../../shared/seed/price-books';
import { SEED_USERS } from '../../../shared/seed/users';
import { lock, TX_OPTIONS, USERS_LOCK } from './locks';
import { bookToRows, productToRow } from './mappers';

export const BCRYPT_COST = 12;
let hashed: Promise<string[]> | undefined;

/** Hashes once per process: cost 12 is deliberately slow and tests reseed before every test. */
const seedHashes = (): Promise<string[]> =>
  (hashed ??= Promise.all(SEED_USERS.map((u) => bcrypt.hash(u.password, BCRYPT_COST))));

async function insertSeed(db: Prisma.TransactionClient, hashes: string[]): Promise<void> {
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
  const hashes = await seedHashes();
  return db.$transaction(async (tx) => {
    await lock(tx, USERS_LOCK);
    if ((await tx.user.count()) > 0) return 'skipped';
    await insertSeed(tx, hashes);
    return 'seeded';
  }, TX_OPTIONS);
}

/** Test schema only: callers must have passed testDatabase(). Prisma queries, never TRUNCATE. */
export async function resetAndSeed(db: PrismaClient): Promise<void> {
  const hashes = await seedHashes();
  await db.$transaction(async (tx) => {
    await lock(tx, USERS_LOCK);
    await tx.priceBookEntry.deleteMany();
    await tx.priceBook.deleteMany();
    await tx.product.deleteMany();
    await tx.user.deleteMany();
    await insertSeed(tx, hashes);
  }, TX_OPTIONS);
}
