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
  assert.equal(nextPriceBookId([]), 'PL000001');
  assert.equal(nextPriceBookId(SEED_PRICE_BOOKS), 'PL000035');
});

test('creating a price book converts prices and never stores master list prices', () => {
  const catalogBefore = JSON.stringify(PRODUCTS);
  const { books, book } = expectOk(
    savePriceBook(SEED_PRICE_BOOKS, base(), null, PRODUCTS, 'Demo Product Lead', now),
  );
  assert.equal(book.id, 'PL000035');
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
    savePriceBook(SEED_PRICE_BOOKS, d, 'PL000013', PRODUCTS, 'Demo Admin', now),
  );
  assert.deepEqual(
    [book.id, book.name, book.description],
    ['PL000013', 'Standard Retail 2026', 'Updated memo'],
  );
  assert.equal(
    expectFail(savePriceBook(SEED_PRICE_BOOKS, d, 'PL999999', PRODUCTS, 'x', now)),
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
  const first = expectOk(duplicatePriceBook(SEED_PRICE_BOOKS, 'PL000013', 'x', now));
  assert.deepEqual(
    [first.book.id, first.book.name, first.book.active],
    ['PL000035', 'Standard Retail 2026 (copy)', false],
  );
  const second = expectOk(duplicatePriceBook(first.books, 'PL000013', 'x', now));
  assert.equal(second.book.name, 'Standard Retail 2026 (copy 2)');
  first.book.entries[0].memo = 'changed';
  assert.equal(SEED_PRICE_BOOKS[0].entries[0].memo, '');
});

test('activate/deactivate and filtering', () => {
  const off = expectOk(setPriceBookActive(SEED_PRICE_BOOKS, 'PL000030', false, 'x', now));
  assert.equal(off.find((b) => b.id === 'PL000030')!.active, false);
  assert.equal(
    expectFail(setPriceBookActive(SEED_PRICE_BOOKS, 'PL999999', true, 'x', now)),
    'Price book not found.',
  );
  assert.deepEqual(
    filterPriceBooks(SEED_PRICE_BOOKS, 'HOLIDAY', 'all').map((b) => b.id),
    ['PL000034'],
  );
  assert.deepEqual(
    filterPriceBooks(SEED_PRICE_BOOKS, 'pl000030', 'all').map((b) => b.id),
    ['PL000030'],
  );
  assert.deepEqual(
    filterPriceBooks(SEED_PRICE_BOOKS, '', 'inactive').map((b) => b.id),
    ['PL000034'],
  );
  assert.deepEqual(
    filterPriceBooks(SEED_PRICE_BOOKS, 'branches', 'active').map((b) => b.id),
    ['PL000013'],
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

test('auto IDs follow the POS price list format', () => {
  assert.equal(nextPriceBookId([]), 'PL000001');
  assert.equal(nextPriceBookId(SEED_PRICE_BOOKS), 'PL000035');
  assert.deepEqual(
    SEED_PRICE_BOOKS.map((b) => b.id),
    ['PL000013', 'PL000030', 'PL000034'],
  );
});

test('manual Price IDs are normalised, validated and unique', () => {
  const manual = (id: string) => ({ ...base(), autoId: false, id });
  const e = (id: string) => validatePriceBook(manual(id), SEED_PRICE_BOOKS, PRODUCTS, null).id;
  assert.equal(e(' ps000015 '), undefined);
  assert.equal(e('PX123'), 'Price ID must be PL or PS followed by 6 digits (e.g. PL000123).');
  assert.equal(e('pl000013'), 'Price ID PL000013 is already used.');
  const { book } = expectOk(
    savePriceBook(SEED_PRICE_BOOKS, manual(' ps000015 '), null, PRODUCTS, 'x', now),
  );
  assert.equal(book.id, 'PS000015');
  const auto = expectOk(savePriceBook(SEED_PRICE_BOOKS, base(), null, PRODUCTS, 'x', now));
  assert.equal(auto.book.id, 'PL000035');
});

test('editing never changes the Price ID', () => {
  const d = { ...draftFromBook(SEED_PRICE_BOOKS[0]), id: 'PL999999' };
  assert.equal(
    expectOk(savePriceBook(SEED_PRICE_BOOKS, d, 'PL000013', PRODUCTS, 'x', now)).book.id,
    'PL000013',
  );
});
