import assert from 'node:assert/strict';
import { test, expectOk, expectFail } from './harness';
import { readPricingStorage, writePricingStorage } from '../src/app/domain/pricing-storage';
import { SEED_PRICE_BOOKS } from '../src/app/mock-data/price-books';
import { PRODUCTS } from '../src/app/mock-data/products';
import { duplicatePriceBook, emptyDraft, savePriceBook } from '../src/app/domain/price-books';

const state = () => ({
  version: 1 as const,
  books: structuredClone(SEED_PRICE_BOOKS),
  products: structuredClone(PRODUCTS),
});

test('pricing storage round trips the catalog and books together, including manual fields', () => {
  let saved: string | null = null;
  const storage = {
    getItem: () => saved,
    setItem: (_key: string, value: string) => {
      saved = value;
    },
  };
  assert.equal(expectOk(readPricingStorage(() => storage)), null);
  const data = state();
  data.books[0].entries[0].manual = {
    name: 'Manual item',
    qty: 1,
    toQty: null,
    unit: 'PCS',
    masterListPrice: 1000,
    unitPrice: 900,
    discountPercent: 10,
    discount: 90,
    netPrice: 810,
    cost: 850,
  };
  data.books[0].entries[0].updatedPrice = 810;
  expectOk(writePricingStorage(() => storage, data));
  const loaded = expectOk(readPricingStorage(() => storage));
  assert.deepEqual(loaded, data);
  assert.notEqual(loaded, data);
});

test('unreadable or incompatible saved prices are reported instead of silently resetting', () => {
  const valid = state();
  for (const saved of [
    '{broken',
    '{}',
    JSON.stringify({ ...valid, version: 2 }),
    JSON.stringify({ ...valid, books: [{ id: 'PL000005' }] }),
    JSON.stringify({ ...valid, products: [{ ...valid.products[0], masterListPrice: 'bad' }] }),
  ]) {
    assert.match(
      expectFail(readPricingStorage(() => ({ getItem: () => saved }))),
      /saved price books/i,
    );
  }
});

test('blocked and full browser storage never report a successful save', () => {
  const blocked = () => {
    throw new Error('Blocked');
  };
  assert.match(expectFail(readPricingStorage(blocked)), /browser storage/i);
  assert.match(expectFail(writePricingStorage(blocked, state())), /not saved/i);
  assert.match(
    expectFail(
      writePricingStorage(
        () => ({
          setItem: () => {
            throw new Error('Full');
          },
        }),
        state(),
      ),
    ),
    /not saved/i,
  );
});

test('automatic IDs after PL999999 stay reloadable for new and duplicated books', () => {
  const data = state();
  data.books[0].id = 'PL999999';
  const created = expectOk(
    savePriceBook(
      data.books,
      { ...emptyDraft('2026-11-17'), name: 'After highest ID' },
      null,
      data.products,
      'tester',
      new Date(),
    ),
  );
  assert.match(created.book.id, /^PL\d{6}$/);
  assert.equal(created.book.id, 'PL000001');
  const copied = expectOk(duplicatePriceBook(created.books, 'PL999999', 'tester', new Date()));
  assert.equal(copied.book.id, 'PL000002');
  let saved: string | null = null;
  const storage = {
    getItem: () => saved,
    setItem: (_key: string, value: string) => {
      saved = value;
    },
  };
  expectOk(writePricingStorage(() => storage, { ...data, books: copied.books }));
  assert.equal(expectOk(readPricingStorage(() => storage))?.books.length, 5);
});

test('an unreadable snapshot cannot replace previously saved pricing data', () => {
  let saved: string | null = null;
  const storage = {
    getItem: () => saved,
    setItem: (_key: string, value: string) => {
      saved = value;
    },
  };
  expectOk(writePricingStorage(() => storage, state()));
  const original = saved;
  const invalid = state();
  invalid.books[0].id = 'PL1000000';
  expectFail(writePricingStorage(() => storage, invalid));
  assert.equal(saved, original);
  assert.equal(expectOk(readPricingStorage(() => storage))?.books[0].id, 'PL000013');
});

const roundTrip = (data: unknown) => {
  const saved = JSON.stringify(data);
  return readPricingStorage(() => ({ getItem: () => saved }));
};

test('pricing saved before Support still loads', () => {
  const data = state();
  Object.assign(data.books[0].entries[0], {
    updatedPrice: 900,
    manual: {
      name: 'Old manual item',
      qty: 1,
      toQty: null,
      unit: 'PCS',
      masterListPrice: 1200,
      unitPrice: 1000,
      discountPercent: 10,
      discount: 100,
      netPrice: 900,
      cost: 950,
      margin: -5.56,
    },
  });
  expectOk(roundTrip(data));
});

test('Support round trips as pesos and invalid Support is rejected', () => {
  const data = state();
  data.books[0].entries[0].support = 1500;
  assert.deepEqual(expectOk(roundTrip(data)), data);
  data.books[0].entries[0].support = -1;
  assert.match(expectFail(roundTrip(data)), /saved price books/i);
  data.books[0].entries[0].support = '1500' as never;
  assert.match(expectFail(roundTrip(data)), /saved price books/i);
});

test('₱/% Support saved before Support became pesos-only still loads', () => {
  const data = state();
  Object.assign(data.books[0].entries[0], { support: { kind: 'amount', value: 1500 } });
  Object.assign(data.books[0].entries[1], { support: { kind: 'percent', value: 5 } });
  const loaded = expectOk(roundTrip(data))!;
  assert.equal(loaded.books[0].entries[0].support, 1500);
  assert.equal('support' in loaded.books[0].entries[1], false);
});
