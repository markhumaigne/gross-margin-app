import assert from 'node:assert/strict';
import { test } from './harness';
import { buildSalesReport, detectMapping } from '../src/app/domain/sales-report';
import { PriceBook } from '../src/app/domain/price-books';
import { PriceBookEntry } from '../src/app/domain/pricing';
import { matchPriceBook } from '../src/app/domain/price-match';
import { Support } from '../src/app/domain/support';

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

const AMOUNT_100: Support = { kind: 'amount', value: 100 };
const psBook = (support: Support | undefined, o: Partial<PriceBook> = {}) =>
  book({
    id: 'PS000015',
    name: 'PS',
    entries: [{ ...entry('H-1', 2795, null), ...(support ? { support } : {}) }],
    ...o,
  });
const PS_ROWS = [P, ['H-1', 'PS000015', 2, 5590, 1960]];

test('PS sales earn Support per unit', () => {
  const r = report(PS_ROWS, [psBook(AMOUNT_100)]);
  assert.equal(r.priceComparison.lines[0].support, 200);
  assert.equal(r.priceComparison.support, 200);
  assert.deepEqual(
    [
      r.lines[0].support,
      r.lines[0].grossProfitAfterSupport,
      r.lines[0].grossMarginAfterSupportPercent,
    ],
    [200, 1870, 33.45],
  );
  assert.deepEqual(
    [r.totals.support, r.totals.grossProfitAfterSupport, r.totals.grossMarginAfterSupportPercent],
    [200, 1870, 33.45],
  );
});

test('percent Support is taken from actual net sales', () => {
  const r = report(PS_ROWS, [psBook({ kind: 'percent', value: 5 })]);
  assert.equal(r.priceComparison.support, 279.5);
  assert.equal(r.lines[0].support, 279.5);
});

test('₱0 sales lines earn no support', () => {
  const r = report([P, ['H-1', 'PS000015', 1, 0, 1960]], [psBook(AMOUNT_100)]);
  assert.equal(r.lines[0].support, 0);
  assert.equal(r.priceComparison.support, 0);
});

test('support still counts when the PS book is inactive', () => {
  const r = report(PS_ROWS, [psBook(AMOUNT_100, { active: false })]);
  assert.deepEqual(
    [
      r.priceComparison.lines[0].status,
      r.priceComparison.lines[0].price,
      r.priceComparison.lines[0].support,
    ],
    ['inactive', null, 200],
  );
});

test('PL books never add support', () => {
  const stray = book({ entries: [{ ...entry('H-1', 2795, null), support: AMOUNT_100 }] });
  assert.equal(matchPriceBook([stray], 'PL000013', 'H-1', null).support, null);
  const r = report([P, ['H-1', 'PL000013', 2, 5590, 1960]], [stray]);
  assert.equal(r.totals.support, 0);
});

test('after-support totals cover products with known cost', () => {
  const ps = book({
    id: 'PS000015',
    entries: [
      { ...entry('H-1', 2795, null), support: AMOUNT_100 },
      { ...entry('N-1', 1000, null), support: { kind: 'amount', value: 50 } },
    ],
  });
  const r = report([P, ['H-1', 'PS000015', 2, 5590, 1960], ['N-1', 'PS000015', 1, 1000, '']], [ps]);
  assert.deepEqual(
    [r.totals.support, r.totals.grossProfitAfterSupport, r.totals.grossMarginAfterSupportPercent],
    [250, 1870, 33.45],
  );
  const missing = r.lines.find((l) => l.productId === 'N-1')!;
  assert.deepEqual(
    [missing.support, missing.grossProfitAfterSupport, missing.grossMarginAfterSupportPercent],
    [50, null, null],
  );
});
