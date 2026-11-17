import assert from 'node:assert/strict';
import { test } from './harness';
import { buildSalesReport, detectMapping } from '../src/app/domain/sales-report';
import { PriceBook } from '../src/app/domain/price-books';
import { PriceBookEntry } from '../src/app/domain/pricing';

const book = (o: Partial<PriceBook>): PriceBook => ({
  id: 'PL000013',
  name: 'B',
  description: '',
  effectiveDate: '2026-01-01',
  expirationDate: null,
  active: true,
  updatedAt: '',
  updatedBy: '',
  entries: [],
  ...o,
});
const entry = (
  productId: string,
  updatedPrice: number | null,
  promoPrice: number | null,
): PriceBookEntry => ({
  productId,
  updatedPrice,
  promoPrice,
  effectiveStart: '2026-01-01',
  effectiveEnd: null,
  memo: '',
});
const books = [
  book({ entries: [entry('A-1', 5595, null), entry('B-2', 1395, 999)] }),
  book({ id: 'PL000034', name: 'C', active: false, entries: [entry('A-1', 5000, null)] }),
];
const P = ['SKU', 'Price ID', 'Qty', 'Net Total', 'Unit Cost'];
const report = (rows: unknown[][], live: readonly PriceBook[] = books) =>
  buildSalesReport(rows, { headerRow: 0, ...detectMapping(rows[0]) }, live);

test('Price ID column is detected', () => {
  assert.equal(detectMapping(P).mapping.priceId, 1);
  assert.equal(detectMapping(['Product ID', 'PriceList', 'Qty', 'Amount']).mapping.priceId, 1);
});

test('rows are matched to price books by Price ID', () => {
  const r = report([
    P,
    ['A-1', ' pl000013 ', 2, 11590, 4861],
    ['B-2', 'PL000013', 1, 1295, 800],
    ['A-1', '', 1, 6190, 4861],
    ['A-1', 'PL000034', 1, 6000, 4861],
    ['A-1', 'PS000099', 1, 6000, 4861],
    ['A-1', 'PL000013', 0, 1, 1],
  ]);
  assert.deepEqual(
    r.priceComparison.lines.map((l) => [
      l.priceId,
      l.productId,
      l.status,
      l.price,
      l.priceSource,
      l.expectedRevenue,
      l.variance,
    ]),
    [
      ['PL000013', 'A-1', 'matched', 5595, 'updated', 11190, 400],
      ['PL000013', 'B-2', 'matched', 999, 'promo', 999, 296],
      ['PL000034', 'A-1', 'inactive', null, null, null, null],
      ['PS000099', 'A-1', 'not-found', null, null, null, null],
    ],
  );
  assert.deepEqual(
    [
      r.priceComparison.matchedLines,
      r.priceComparison.actualNetSales,
      r.priceComparison.expectedRevenue,
      r.priceComparison.variance,
    ],
    [2, 12885, 12189, 696],
  );
  const a = r.lines.find((l) => l.productId === 'A-1')!;
  assert.deepEqual(
    [a.priceIds, a.regularPriceRows, a.netSales],
    [['PL000013', 'PL000034', 'PS000099'], 1, 29780],
  );
  assert.ok(
    r.issues.some(
      (i) => i.message === 'Price book PL000034 is inactive; no price-book price applied.',
    ),
  );
  assert.ok(r.issues.some((i) => i.message === 'Price ID PS000099 not found in price books.'));
});

test('a product missing from the named price book is reported', () => {
  const live = [book({ id: 'PL000034', entries: [entry('A-1', 5000, null)] })];
  const r = report([P, ['B-2', 'PL000034', 1, 1295, 800]], live);
  assert.equal(r.priceComparison.lines[0].status, 'not-in-book');
  assert.equal(r.issues[0].message, 'Product is not in price book PL000034.');
});

test('without a Price ID column every sale is regular price', () => {
  const r = report([
    ['Product ID', 'Product Name', 'Qty', 'Net Total', 'Cost'],
    ['A-1', 'x', 1, 6190, 4861],
  ]);
  assert.deepEqual(
    [r.priceComparison.lines, r.lines[0].priceIds, r.lines[0].regularPriceRows],
    [[], [], 1],
  );
});

test('comparison shows the POS selling price', () => {
  const head = ['SKU', 'Price ID', 'Qty', 'Net Total', 'Cost', 'Selling Price'];
  const r = report([
    head,
    ['A-1', 'PL000013', 1, 5795, 4861, 5795],
    ['A-1', 'PL000013', 1, 5795, 4861, 5795],
    ['A-1', 'PL000013', 1, 5000, 4861, 5000],
  ]);
  assert.equal(r.priceComparison.lines[0].posSellingPrice, 5795);
  assert.equal(
    report([P, ['A-1', 'PL000013', 1, 5795, 1]]).priceComparison.lines[0].posSellingPrice,
    null,
  );
});
