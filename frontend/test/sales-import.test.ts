import assert from 'node:assert/strict';
import { expectFail, expectOk, test } from './harness';
import { importFromExport } from '../src/app/domain/sales-import';
import { parseReportDate } from '../src/app/domain/dates';
import { draftFromBook, hasErrors, validatePriceBook } from '../src/app/domain/price-books';
import { PRODUCTS } from '../src/app/mock-data/products';
import { SEED_PRICE_BOOKS } from '../src/app/mock-data/price-books';

const rows: unknown[][] = [
  ['Title'],
  [],
  [
    'Product ID',
    'Product Name',
    'Date',
    'Qty',
    'Unit',
    'Cost',
    'Master Price',
    'Selling Price',
    'Price\nID',
  ],
  ['R-1', 'Real SSD', '11/16/2026', 1, 'PCS', 11501, 13995, 15195, 'PL000034'],
  ['R-1', 'Real SSD', '11/16/2026', 1, 'PCS', 11501, 13995, 15195, 'PL000034'],
  ['R-1', 'Real SSD', '11/16/2026', 1, 'PCS', 11501, 13995, 13995, ''],
  ['R-2', 'Real Pad', '11/16/2026', 1, 'PCS', 900, 1500, 1200, 'PS000010'],
  ['R-3', 'Free Bag', '11/16/2026', 1, 'PCS', 8, 0, 0, ''],
  ['4800000100035', 'Office Mon', '11/16/2026', 2, 'PCS', 2879, 3950, 3795, 'PL000013'],
  [null, null, null, 4, null, null, null, null, null],
  ['4 items  ******** NOTHING FOLLOWS ********'],
];
const now = new Date('2026-11-17T02:00:00Z');
const runImport = (catalog = PRODUCTS, books = SEED_PRICE_BOOKS) =>
  expectOk(importFromExport(rows, 'x.xlsx', '2026-11-17', catalog, books, now, 'Lead'));

test('imports products from the export without touching the catalog', () => {
  const { products, summary } = runImport();
  const ssd = products.find((p) => p.id === 'R-1')!;
  assert.deepEqual(
    [ssd.name, ssd.masterListPrice, ssd.sellingPrice, ssd.cost, ssd.onHand, ssd.source],
    ['Real SSD', 13995, 13995, 11501, null, 'import'],
  );
  assert.deepEqual(
    [summary.productsAdded, summary.productsAlreadyInCatalog, summary.productsWithoutPrice],
    [2, 1, 1],
  );
  assert.equal(products.find((p) => p.id === '4800000100035')!.masterListPrice, 3950);
  assert.equal(products.length, PRODUCTS.length + 2);
});

test('imports price lists: new PL/PS books and extends existing ones', () => {
  const { books, summary, products } = runImport();
  const ps = books.find((b) => b.id === 'PS000010')!;
  assert.deepEqual(
    [ps.name, ps.active, ps.effectiveDate, ps.expirationDate],
    ['Imported PS000010', true, '2026-11-16', '2026-11-16'],
  );
  assert.deepEqual(
    ps.entries.map((e) => [e.productId, e.promoPrice, e.updatedPrice, e.effectiveEnd]),
    [['R-2', 1200, null, '2026-11-16']],
  );
  const pl34 = books.find((b) => b.id === 'PL000034')!;
  assert.equal(pl34.name, 'December Holiday Promo');
  assert.deepEqual(
    pl34.entries.find((e) => e.productId === 'R-1'),
    {
      productId: 'R-1',
      updatedPrice: 15195,
      promoPrice: null,
      effectiveStart: '2026-12-01',
      effectiveEnd: '2026-12-31',
      memo: '',
    },
  );
  assert.equal(pl34.entries.length, SEED_PRICE_BOOKS[2].entries.length + 1);
  assert.equal(books.find((b) => b.id === 'PL000013')!.entries.at(-1)!.updatedPrice, 3795);
  assert.deepEqual(summary.booksCreated, ['PS000010']);
  assert.deepEqual(summary.booksExtended, [
    { id: 'PL000013', added: 1 },
    { id: 'PL000034', added: 1 },
  ]);
  for (const b of books)
    assert.equal(
      hasErrors(validatePriceBook(draftFromBook(b), books, products, b.id)),
      false,
      b.id,
    );
  assert.equal(SEED_PRICE_BOOKS[0].entries.length, 2, 'seed books are not mutated');
});

test('re-importing adds nothing twice', () => {
  const first = runImport();
  const again = runImport(first.products, first.books);
  assert.deepEqual(
    [again.summary.productsAdded, again.summary.booksCreated, again.summary.booksExtended],
    [0, [], []],
  );
});

test('files without the needed columns are rejected; report dates parse', () => {
  assert.equal(
    expectFail(
      importFromExport(
        [
          ['Name', 'Qty'],
          ['x', 1],
        ],
        'x.csv',
        '2026-11-17',
        PRODUCTS,
        SEED_PRICE_BOOKS,
        now,
        'L',
      ),
    ),
    'This file has no Product ID and price columns.',
  );
  assert.deepEqual(['11/16/2026', 46296, '2026-10-01', 'nope'].map(parseReportDate), [
    '2026-11-16',
    '2026-10-01',
    '2026-10-01',
    null,
  ]);
});
