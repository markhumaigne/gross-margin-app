import assert from 'node:assert/strict';
import { expectFail, expectOk, test } from './harness';
import {
  draftFromBook,
  duplicatePriceBook,
  emptyDraft,
  filterPriceBooks,
  hasErrors,
  newEntryDraft,
  nextPriceBookId,
  PriceBookDraft,
  savePriceBook,
  setPriceBookActive,
  validatePriceBook,
} from '../src/app/domain/price-books';
import { SEED_PRICE_BOOKS } from '../src/app/mock-data/price-books';
import { PRODUCTS } from '../src/app/mock-data/products';

const now = new Date('2026-11-17T02:00:00Z');
const base = (): PriceBookDraft => ({
  ...emptyDraft('2026-11-17'),
  name: 'Weekend Flash Sale',
  entries: [
    {
      ...newEntryDraft('4800000100011', { effectiveDate: '2026-11-17', expirationDate: '' }),
      updatedPrice: '₱5,495.00',
    },
  ],
});

test('ids increment from the highest existing id', () => {
  assert.equal(nextPriceBookId([]), 'PB-0001');
  assert.equal(nextPriceBookId(SEED_PRICE_BOOKS), 'PB-0004');
});

test('creating a price book converts prices and never stores master list prices', () => {
  const catalogBefore = JSON.stringify(PRODUCTS);
  const { books, book } = expectOk(
    savePriceBook(SEED_PRICE_BOOKS, base(), null, PRODUCTS, 'Demo Product Lead', now),
  );
  assert.equal(book.id, 'PB-0004');
  assert.equal(book.entries[0].updatedPrice, 5495);
  assert.equal('masterListPrice' in book.entries[0], false);
  assert.equal(JSON.stringify(PRODUCTS), catalogBefore);
  assert.deepEqual(
    [book.updatedAt, book.updatedBy],
    ['2026-11-17T02:00:00.000Z', 'Demo Product Lead'],
  );
  assert.equal(books.length, 4);
  assert.equal(SEED_PRICE_BOOKS.length, 3);
});

test('editing keeps the id and allows keeping its own name', () => {
  const d = { ...draftFromBook(SEED_PRICE_BOOKS[0]), description: 'Updated memo' };
  const { book } = expectOk(
    savePriceBook(SEED_PRICE_BOOKS, d, 'PB-0001', PRODUCTS, 'Demo Admin', now),
  );
  assert.deepEqual(
    [book.id, book.name, book.description],
    ['PB-0001', 'Standard Retail 2026', 'Updated memo'],
  );
  assert.equal(
    expectFail(savePriceBook(SEED_PRICE_BOOKS, d, 'PB-9999', PRODUCTS, 'x', now)),
    'Price book not found.',
  );
});

test('price book validation', () => {
  const e = (d: PriceBookDraft) => validatePriceBook(d, SEED_PRICE_BOOKS, PRODUCTS, null);
  assert.equal(e({ ...base(), name: ' ' }).name, 'Price book name is required.');
  assert.equal(
    e({ ...base(), name: 'november monitor sale ' }).name,
    'A price book named "november monitor sale" already exists.',
  );
  assert.equal(
    e({ ...base(), expirationDate: '2026-11-01' }).expirationDate,
    'Expiration date cannot be before the effective date.',
  );
  assert.equal(e({ ...base(), effectiveDate: '' }).effectiveDate, 'Effective date is required.');
  const dup = base();
  dup.entries.push({ ...dup.entries[0] });
  assert.deepEqual(e(dup).form, ['Product 4800000100011 is listed more than once.']);
  const bad = base();
  bad.entries[0].promoPrice = 'abc';
  assert.deepEqual(e(bad).entries['4800000100011'], [
    'Promotional price must be a positive amount with up to 2 decimals.',
  ]);
  assert.equal(hasErrors(e(base())), false);
  assert.equal(
    expectFail(savePriceBook(SEED_PRICE_BOOKS, bad, null, PRODUCTS, 'x', now)),
    'Fix the highlighted fields before saving.',
  );
});

test('duplicate creates an inactive independent copy with a unique name', () => {
  const first = expectOk(duplicatePriceBook(SEED_PRICE_BOOKS, 'PB-0001', 'x', now));
  assert.deepEqual(
    [first.book.id, first.book.name, first.book.active],
    ['PB-0004', 'Standard Retail 2026 (copy)', false],
  );
  const second = expectOk(duplicatePriceBook(first.books, 'PB-0001', 'x', now));
  assert.equal(second.book.name, 'Standard Retail 2026 (copy 2)');
  first.book.entries[0].memo = 'changed';
  assert.equal(SEED_PRICE_BOOKS[0].entries[0].memo, '');
});

test('activate/deactivate and filtering', () => {
  const off = expectOk(setPriceBookActive(SEED_PRICE_BOOKS, 'PB-0002', false, 'x', now));
  assert.equal(off.find((b) => b.id === 'PB-0002')!.active, false);
  assert.equal(
    expectFail(setPriceBookActive(SEED_PRICE_BOOKS, 'PB-9', true, 'x', now)),
    'Price book not found.',
  );
  assert.deepEqual(
    filterPriceBooks(SEED_PRICE_BOOKS, 'HOLIDAY', 'all').map((b) => b.id),
    ['PB-0003'],
  );
  assert.deepEqual(
    filterPriceBooks(SEED_PRICE_BOOKS, 'pb-0002', 'all').map((b) => b.id),
    ['PB-0002'],
  );
  assert.deepEqual(
    filterPriceBooks(SEED_PRICE_BOOKS, '', 'inactive').map((b) => b.id),
    ['PB-0003'],
  );
  assert.deepEqual(
    filterPriceBooks(SEED_PRICE_BOOKS, 'branches', 'active').map((b) => b.id),
    ['PB-0001'],
  );
});

test('seed price books are valid', () => {
  for (const b of SEED_PRICE_BOOKS)
    assert.equal(
      hasErrors(validatePriceBook(draftFromBook(b), SEED_PRICE_BOOKS, PRODUCTS, b.id)),
      false,
      b.id,
    );
});
