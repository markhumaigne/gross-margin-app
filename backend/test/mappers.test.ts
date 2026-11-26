import assert from 'node:assert/strict';
import { test } from './harness';
import { Prisma } from '../src/generated/prisma/client';
import type { PriceBook } from '../../shared/domain/price-books';
import type { Product } from '../../shared/domain/pricing';
import { applyZenposPriceBook } from '../../shared/domain/price-book-import';
import type { ZenposPriceBook, ZenposProductRow } from '../../shared/domain/zenpos-price-book';
import { SEED_PRICE_BOOKS } from '../../shared/seed/price-books';
import { PRODUCTS } from '../../shared/seed/products';
import {
  bookFromRow,
  bookToRows,
  dateValue,
  diffBooks,
  isoDate,
  productFromRow,
  productToRow,
} from '../src/database/mappers';
import { testDatabase } from '../src/env';

const zrow = (productId: string, netPrice: number): ZenposProductRow => ({
  productId,
  name: 'Item ' + productId,
  qty: 0,
  toQty: 99999,
  unit: 'PCS',
  unitPrice: netPrice,
  discount: 0,
  discountPercent: 0,
  netPrice,
  cost: 1000,
});

function importedPsBookWithManualAndSupport(): PriceBook {
  const parsed: ZenposPriceBook = {
    priceId: 'PS000015',
    name: 'Imported Promo',
    active: true,
    memo: 'REF#: 1',
    period: { start: '2026-11-06', end: '2026-11-19' },
    products: [zrow('A', 2499), zrow('B', 1999)],
    skippedRows: 0,
  };
  const { book } = applyZenposPriceBook(
    [],
    parsed,
    'Price Book.xlsx',
    '2026-11-18',
    new Date('2026-11-18T02:00:00Z'),
    'Lead',
  );
  return { ...book, entries: [{ ...book.entries[0], support: 100 }, ...book.entries.slice(1)] };
}

const dec = (v: unknown): unknown =>
  typeof v === 'string' ? new Prisma.Decimal(v) : v === undefined ? null : v;

// Turns the mapper's decimal strings into Prisma.Decimal, the way the database returns them.
function asStoredRow(rows: ReturnType<typeof bookToRows>) {
  const moneyKeys = new Set([
    'updatedPrice',
    'promoPrice',
    'support',
    'manualMasterListPrice',
    'manualUnitPrice',
    'manualDiscountPercent',
    'manualDiscount',
    'manualNetPrice',
    'manualCost',
  ]);
  const entries = rows.entries.map((e) => {
    const stored: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(e)) stored[k] = moneyKeys.has(k) ? dec(v) : (v ?? null);
    for (const k of moneyKeys) if (!(k in stored)) stored[k] = null;
    for (const k of ['manualName', 'manualQty', 'manualToQty', 'manualUnit', 'effectiveEnd'])
      if (!(k in stored)) stored[k] = null;
    return stored;
  });
  return { ...rows.book, expirationDate: rows.book.expirationDate ?? null, entries } as never;
}

function asStoredProduct(row: Prisma.ProductCreateManyInput) {
  return {
    ...row,
    onHand: row.onHand ?? null,
    cost:
      row.cost === undefined || row.cost === null ? null : new Prisma.Decimal(row.cost as string),
    source: row.source ?? null,
    masterListPrice: new Prisma.Decimal(row.masterListPrice as string),
    sellingPrice: new Prisma.Decimal(row.sellingPrice as string),
  } as never;
}

test('calendar dates map to UTC midnight and back', () => {
  assert.equal(dateValue('2026-11-30').toISOString(), '2026-11-30T00:00:00.000Z');
  assert.equal(isoDate(dateValue('2026-11-30')), '2026-11-30');
});

test('every seed price book and an imported PS book survive the row mapping', () => {
  for (const book of [...SEED_PRICE_BOOKS, importedPsBookWithManualAndSupport()])
    assert.deepStrictEqual(bookFromRow(asStoredRow(bookToRows(book))), book);
});

test('catalog products survive the row mapping without inventing a source', () => {
  for (const p of PRODUCTS as readonly Product[])
    assert.deepStrictEqual(productFromRow(asStoredProduct(productToRow(p))), p);
});

test('test database settings refuse anything that could reach real data', () => {
  const real = {
    DATABASE_URL: 'postgresql://u:p@h:6543/postgres',
    DIRECT_URL: 'postgresql://u:p@h:5432/postgres',
  };
  const ok = {
    ...real,
    TEST_DATABASE_URL: real.DATABASE_URL + '?schema=test',
    TEST_DIRECT_URL: real.DIRECT_URL + '?schema=test',
  };
  assert.equal(testDatabase(ok).schema, 'test');
  assert.throws(() => testDatabase({ ...ok, TEST_DIRECT_URL: real.DIRECT_URL })); // no schema
  assert.throws(() =>
    testDatabase({ ...ok, TEST_DATABASE_URL: real.DATABASE_URL + '?schema=public' }),
  );
  assert.throws(() => testDatabase({ ...ok, TEST_DATABASE_URL: undefined }));
});

test('diffBooks reports only changed, added and removed books', () => {
  const [a, b, c] = SEED_PRICE_BOOKS;
  const changed = { ...b, entries: [{ ...b.entries[0], promoPrice: 4899 }, ...b.entries.slice(1)] };
  const reordered = Object.fromEntries(Object.entries(a).reverse()) as unknown as PriceBook;
  assert.deepStrictEqual(diffBooks([a, b, c], [reordered, changed]), {
    upserts: [changed],
    deletes: [c.id],
  });
});
