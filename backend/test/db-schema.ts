import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { Client } from 'pg';
import { test } from './harness';
import { freshDb } from './db-helpers';
import { dateValue, isoDate } from '../src/database/mappers';
import { seedIfEmpty } from '../src/database/seed';
import { TEST_DB } from './db-settings';

const code = (e: unknown): unknown => (e as { code?: unknown }).code;
const user = (over: Record<string, unknown>) => ({
  id: 'x-1',
  username: 'extra',
  displayName: 'Extra',
  passwordHash: '$2b$12$placeholder',
  role: 'admin',
  ...over,
});

test('migrations enable RLS on every table and drop the product catalog', async () => {
  const { directUrl, schema } = TEST_DB;
  const url = new URL(directUrl);
  url.searchParams.delete('schema');
  const client = new Client({ connectionString: url.toString() });
  await client.connect();
  try {
    const { rows } = await client.query(
      "SELECT relname, relrowsecurity FROM pg_class WHERE relnamespace = $1::regnamespace AND relname IN ('users','price_books','price_book_entries','_prisma_migrations')",
      [schema],
    );
    assert.equal(rows.length, 4);
    assert.ok(rows.every((r) => r.relrowsecurity === true));
    const products = await client.query(
      "SELECT 1 FROM pg_class WHERE relnamespace = $1::regnamespace AND relname = 'products'",
      [schema],
    );
    assert.equal(products.rows.length, 0);
  } finally {
    await client.end();
  }
});

test('a calendar date round-trips without shifting', async () => {
  const db = await freshDb();
  try {
    await db.priceBook.create({
      data: {
        id: 'PL000099',
        name: 'Date check',
        effectiveDate: dateValue('2026-11-30'),
        active: true,
        updatedAt: new Date(),
        updatedBy: 'test',
      },
    });
    const row = await db.priceBook.findUniqueOrThrow({ where: { id: 'PL000099' } });
    assert.equal(isoDate(row.effectiveDate), '2026-11-30');
  } finally {
    await db.$disconnect();
  }
});

test('only one Accounting Head can exist', async () => {
  const db = await freshDb();
  try {
    await assert.rejects(
      db.user.create({ data: user({ role: 'accounting-head' }) }),
      (e) => code(e) === 'P2002',
    );
  } finally {
    await db.$disconnect();
  }
});

test('usernames are unique regardless of case', async () => {
  const db = await freshDb();
  try {
    await assert.rejects(
      db.user.create({ data: user({ username: 'ADMIN' }) }),
      (e) => code(e) === 'P2002',
    );
  } finally {
    await db.$disconnect();
  }
});

test('Support is refused on a non-PS book', async () => {
  const db = await freshDb();
  try {
    await assert.rejects(
      db.priceBookEntry.create({
        data: {
          priceBookId: 'PL000013',
          position: 99,
          productId: 'SUPPORT-CHECK',
          effectiveStart: dateValue('2026-01-01'),
          support: '100.00',
        },
      }),
    );
  } finally {
    await db.$disconnect();
  }
});

test('seed never wipes an existing database', async () => {
  const db = await freshDb();
  try {
    assert.equal(await seedIfEmpty(db), 'skipped');
    assert.equal(await db.user.count(), 3);
  } finally {
    await db.$disconnect();
  }
});

test('seeded accounts store bcrypt hashes, not passwords', async () => {
  const db = await freshDb();
  try {
    const users = await db.user.findMany();
    assert.equal(users.length, 3);
    assert.ok(users.every((u) => u.passwordHash.startsWith('$2')));
    const admin = users.find((u) => u.username === 'admin');
    assert.ok(admin && bcrypt.compareSync('Admin123!', admin.passwordHash));
    assert.ok(users.every((u) => !JSON.stringify(u).includes('Admin123!')));
  } finally {
    await db.$disconnect();
  }
});
