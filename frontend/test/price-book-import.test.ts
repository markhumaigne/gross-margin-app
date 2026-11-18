import assert from 'node:assert/strict';
import { test } from './harness';
import { applyZenposPriceBook, formatImportSummary } from '../src/app/domain/price-book-import';
import { ZenposPriceBook, ZenposProductRow } from '../src/app/domain/zenpos-price-book';
import {
  draftFromBook,
  hasErrors,
  PriceBook,
  validatePriceBook,
} from '../src/app/domain/price-books';
import { SEED_PRICE_BOOKS } from '../src/app/mock-data/price-books';

const now = new Date('2026-11-18T02:00:00Z');
const SUPPORT_1500 = 1500;
const SUPPORT_250 = 250;

const row = (productId: string, netPrice: number, cost = 1000): ZenposProductRow => ({
  productId,
  name: 'Item ' + productId,
  qty: 0,
  toQty: 99999,
  unit: 'PCS',
  unitPrice: netPrice,
  discount: 0,
  discountPercent: 0,
  netPrice,
  cost,
});
const parsed = (o: Partial<ZenposPriceBook> = {}): ZenposPriceBook => ({
  priceId: 'PS000005',
  name: 'Sony Promo',
  active: true,
  memo: 'REF#: 2026002485\nNOV. 06 - NOV. 13, 2026',
  period: { start: '2026-11-06', end: '2026-11-19' },
  products: [row('A', 2499, 2387), row('B', 1999, 1500)],
  skippedRows: 0,
  ...o,
});
const run = (books: readonly PriceBook[], file = parsed()) =>
  applyZenposPriceBook(books, file, 'Price Book.xlsx', '2026-11-18', now, 'Lead');
const editEntries = (
  books: readonly PriceBook[],
  change: (e: PriceBook['entries'][number]) => PriceBook['entries'][number],
) => books.map((b) => ({ ...b, entries: b.entries.map(change) }));

test('a new Price ID creates an editable book from the file', () => {
  const { books, book, summary } = run(SEED_PRICE_BOOKS);
  assert.equal(books.length, SEED_PRICE_BOOKS.length + 1);
  assert.deepEqual(
    [
      book.id,
      book.name,
      book.description,
      book.active,
      book.effectiveDate,
      book.expirationDate,
      book.updatedAt,
      book.updatedBy,
    ],
    [
      'PS000005',
      'Sony Promo',
      'REF#: 2026002485\nNOV. 06 - NOV. 13, 2026',
      true,
      '2026-11-06',
      '2026-11-19',
      now.toISOString(),
      'Lead',
    ],
  );
  assert.deepEqual(book.entries[0], {
    productId: 'A',
    updatedPrice: 2499,
    promoPrice: null,
    effectiveStart: '2026-11-06',
    effectiveEnd: '2026-11-19',
    memo: '',
    manual: {
      name: 'Item A',
      qty: 0,
      toQty: 99999,
      unit: 'PCS',
      masterListPrice: 2499,
      unitPrice: 2499,
      discountPercent: 0,
      discount: 0,
      netPrice: 2499,
      cost: 2387,
    },
  });
  assert.equal(summary.created, true);
  assert.equal(formatImportSummary(summary), 'PS000005 created: 2 products');
  assert.equal(hasErrors(validatePriceBook(draftFromBook(book), books, [], book.id)), false);
});

test('summaries count with thousands separators and report skipped rows', () => {
  const many = Array.from({ length: 1419 }, (_, i) => row('P' + i, 100));
  const { summary } = run([], parsed({ priceId: 'PL000013', products: many, skippedRows: 2 }));
  assert.equal(formatImportSummary(summary), 'PL000013 created: 1,419 products; 2 rows skipped');
});

test('Limited Period No: new books start today, existing books keep their start and lose their expiration', () => {
  const fresh = run([], parsed({ period: null })).book;
  assert.deepEqual(
    [
      fresh.effectiveDate,
      fresh.expirationDate,
      fresh.entries[0].effectiveStart,
      fresh.entries[0].effectiveEnd,
    ],
    ['2026-11-18', null, '2026-11-18', null],
  );
  const again = run(run([]).books, parsed({ period: null })).book;
  assert.deepEqual(
    [again.effectiveDate, again.expirationDate, again.entries[0].effectiveStart],
    ['2026-11-06', null, '2026-11-06'],
  );
});

test('re-importing keeps Support, memo and master list price and reports changes', () => {
  const first = run([], parsed({ products: [row('A', 2499), row('B', 1999), row('C', 999)] }));
  const edited = editEntries(first.books, (e) =>
    e.productId === 'A'
      ? {
          ...e,
          memo: 'claim',
          support: SUPPORT_1500,
          manual: { ...e.manual!, masterListPrice: 3000 },
        }
      : e.productId === 'B'
        ? { ...e, support: SUPPORT_250 }
        : e,
  );
  const { book, summary } = run(
    edited,
    parsed({ products: [row('A', 2299), row('B', 1999), row('D', 500)] }),
  );
  assert.equal(
    formatImportSummary(summary),
    'PS000005 updated: 1 added, 1 removed, 1 prices changed, Support kept on 2',
  );
  assert.deepEqual(
    book.entries.map((e) => e.productId),
    ['A', 'B', 'D'],
  );
  const a = book.entries[0];
  assert.deepEqual(
    [a.support, a.memo, a.manual!.masterListPrice, a.updatedPrice, a.manual!.netPrice],
    [SUPPORT_1500, 'claim', 3000, 2299, 2299],
  );
  assert.deepEqual(book.entries[1].support, SUPPORT_250);
  assert.equal('support' in book.entries[2], false);
});

test('a product ID differing only by case or spaces keeps its Support', () => {
  const first = run([], parsed({ products: [row('ab-1', 100)] }));
  const edited = editEntries(first.books, (e) => ({ ...e, support: SUPPORT_1500 }));
  const { book, summary } = run(edited, parsed({ products: [row('AB-1', 100)] }));
  assert.deepEqual(
    [book.entries[0].productId, book.entries[0].support, summary.added, summary.removed],
    ['AB-1', SUPPORT_1500, 0, 0],
  );
});

test('importing the same file twice changes nothing', () => {
  const once = run([]);
  const twice = run(once.books);
  assert.deepEqual(twice.book.entries, once.book.entries);
  assert.equal(twice.books.length, 1);
  assert.equal(
    formatImportSummary(twice.summary),
    'PS000005 updated: 0 added, 0 removed, 0 prices changed, Support kept on 0',
  );
});

test('a name used by another book gets the Price ID appended', () => {
  const clash = run(SEED_PRICE_BOOKS, parsed({ name: 'standard retail 2026' })).book;
  assert.equal(clash.name, 'standard retail 2026 (PS000005)');
  const own = run(run([]).books).book;
  assert.equal(own.name, 'Sony Promo');
});

test('catalog rows of an existing book are replaced by the file', () => {
  const { book, summary } = run(
    SEED_PRICE_BOOKS,
    parsed({ priceId: 'PL000013', products: [row('4800000100011', 5595, 4681)] }),
  );
  assert.deepEqual(
    book.entries.map((e) => [e.productId, !!e.manual, e.updatedPrice]),
    [['4800000100011', true, 5595]],
  );
  assert.equal(
    formatImportSummary(summary),
    'PL000013 updated: 0 added, 1 removed, 0 prices changed',
  );
});

test('PL and PI imports never store Support', () => {
  const first = run([], parsed({ priceId: 'PI000004' }));
  const stray = editEntries(first.books, (e) => ({ ...e, support: SUPPORT_1500 }));
  const { book, summary } = run(stray, parsed({ priceId: 'PI000004' }));
  assert.ok(book.entries.every((e) => !('support' in e)));
  assert.equal(summary.supportKept, 0);
});
