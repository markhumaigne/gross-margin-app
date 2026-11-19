import assert from 'node:assert/strict';
import { expectFail, expectOk, test } from './harness';
import {
  deletePriceBook,
  draftFromBook,
  duplicatePriceBook,
  emptyDraft,
  filterPriceBooks,
  hasErrors,
  isSupportBook,
  newEntryDraft,
  nextPriceBookId,
  PriceBook,
  PriceBookDraft,
  savePriceBook,
  setPriceBookActive,
  supportList,
  validatePriceBook,
} from '../src/app/domain/price-books';
import { SEED_PRICE_BOOKS } from '../src/app/mock-data/price-books';
import { PRODUCTS } from '../src/app/mock-data/products';
import { matchPriceBook } from '../src/app/domain/price-match';

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

test('delete removes only that price book', () => {
  const left = expectOk(deletePriceBook(SEED_PRICE_BOOKS, 'PL000030'));
  assert.deepEqual(
    left.map((b) => b.id),
    SEED_PRICE_BOOKS.filter((b) => b.id !== 'PL000030').map((b) => b.id),
  );
  assert.ok(SEED_PRICE_BOOKS.some((b) => b.id === 'PL000030'));
  assert.equal(expectFail(deletePriceBook(SEED_PRICE_BOOKS, 'PL999999')), 'Price book not found.');
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
  assert.equal(e('PX123'), 'Price ID must be PL, PS or PI followed by 6 digits (e.g. PL000123).');
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

const manualEntry = () => ({
  ...newEntryDraft('001-NEW', { effectiveDate: '2026-11-17', expirationDate: '' }),
  manual: {
    name: ' Custom monitor ',
    qty: '1.5',
    toQty: '10',
    unit: ' PCS ',
    masterListPrice: '₱1,200.00',
    unitPrice: '1000',
    discountPercent: '10',
    discount: '100',
    netPrice: '900',
    cost: '950',
  },
});

test('manual products save without catalog records, retain all fields, and resolve net price', () => {
  const entry = manualEntry();
  const catalogBefore = JSON.stringify(PRODUCTS);
  const { book } = expectOk(
    savePriceBook([], { ...base(), entries: [entry] }, null, PRODUCTS, 'x', now),
  );
  assert.equal(JSON.stringify(PRODUCTS), catalogBefore);
  assert.deepEqual(JSON.parse(JSON.stringify(book.entries[0])).manual, {
    name: 'Custom monitor',
    qty: 1.5,
    toQty: 10,
    unit: 'PCS',
    masterListPrice: 1200,
    unitPrice: 1000,
    discountPercent: 10,
    discount: 100,
    netPrice: 900,
    cost: 950,
  });
  assert.deepEqual(matchPriceBook([book], book.id, '001-NEW', null), {
    status: 'matched',
    price: 900,
    source: 'updated',
    support: null,
  });
  const reopened = draftFromBook(book);
  const savedAgain = expectOk(savePriceBook([book], reopened, book.id, PRODUCTS, 'x', now)).book;
  assert.deepEqual(savedAgain.entries, book.entries);
  const copy = expectOk(duplicatePriceBook([book], book.id, 'x', now)).book;
  assert.deepEqual(copy.entries, book.entries);
  assert.notEqual(Reflect.get(copy.entries[0], 'manual'), Reflect.get(book.entries[0], 'manual'));
});

test('manual products reject invalid identity, ranges, and numbers before saving', () => {
  const invalidValues = [
    { name: ' ' },
    { unit: '' },
    { qty: '-1' },
    { qty: 'abc' },
    { toQty: '1' },
    { masterListPrice: '-1' },
    { unitPrice: '1.234' },
    { discountPercent: '101' },
    { discount: '-5' },
    { netPrice: 'NaN' },
    { cost: '' },
  ];
  for (const patch of invalidValues) {
    const entry = manualEntry();
    entry.productId = PRODUCTS[0].id;
    const draft = { ...base(), entries: [{ ...entry, manual: { ...entry.manual, ...patch } }] };
    assert.equal(
      hasErrors(validatePriceBook(draft, [], PRODUCTS, null)),
      true,
      JSON.stringify(patch),
    );
    expectFail(savePriceBook([], draft, null, PRODUCTS, 'x', now));
  }
  for (const productId of ['', '   ']) {
    const draft = { ...base(), entries: [{ ...manualEntry(), productId }] };
    assert.equal(hasErrors(validatePriceBook(draft, [], PRODUCTS, null)), true);
  }
});

test('manual products accept zero prices and an open quantity range without changing the catalog', () => {
  const entry = manualEntry();
  entry.productId = PRODUCTS[0].id;
  entry.manual = {
    ...entry.manual,
    toQty: '',
    masterListPrice: '0',
    unitPrice: '0',
    discountPercent: '0',
    discount: '0',
    netPrice: '0',
    cost: '0',
  };
  const { book } = expectOk(
    savePriceBook([], { ...base(), entries: [entry] }, null, PRODUCTS, 'x', now),
  );
  assert.equal(JSON.parse(JSON.stringify(book.entries[0])).manual.toQty, null);
  assert.equal(matchPriceBook([book], book.id, entry.productId, 500).price, 0);
});

test('duplicate manual product IDs are rejected after trimming and case normalization', () => {
  const entry = manualEntry();
  entry.productId = PRODUCTS[0].id;
  const draft = { ...base(), entries: [entry, { ...entry, productId: ` ${entry.productId} ` }] };
  assert.equal(hasErrors(validatePriceBook(draft, [], PRODUCTS, null)), true);
  expectFail(savePriceBook([], draft, null, PRODUCTS, 'x', now));
});

test('manual product IDs cannot hide entry validation errors behind object prototype keys', () => {
  for (const productId of ['__proto__', 'constructor', 'toString']) {
    const entry = { ...manualEntry(), productId, effectiveStart: '' };
    const draft = { ...base(), entries: [entry] };
    assert.equal(hasErrors(validatePriceBook(draft, [], PRODUCTS, null)), true, productId);
    expectFail(savePriceBook([], draft, null, PRODUCTS, 'x', now));
  }
});

test('small decimal quantities can be saved again after reopening', () => {
  const entry = manualEntry();
  entry.manual.qty = '0.0000001';
  const { book } = expectOk(
    savePriceBook([], { ...base(), entries: [entry] }, null, PRODUCTS, 'x', now),
  );
  const saved = expectOk(
    savePriceBook([book], draftFromBook(book), book.id, PRODUCTS, 'x', now),
  ).book;
  assert.deepEqual(saved.entries, book.entries);
});

const book = (id: string): PriceBook => ({
  id,
  name: 'Book ' + id,
  description: '',
  effectiveDate: '2026-11-01',
  expirationDate: null,
  active: true,
  entries: [],
  updatedAt: now.toISOString(),
  updatedBy: 'x',
});

test('PI Price IDs are accepted and the error names all three prefixes', () => {
  const draft = { ...emptyDraft('2026-11-18'), autoId: false, id: 'pi000004', name: 'Internal' };
  assert.equal(validatePriceBook(draft, SEED_PRICE_BOOKS, PRODUCTS, null).id, undefined);
  const bad = validatePriceBook({ ...draft, id: 'PX000001' }, SEED_PRICE_BOOKS, PRODUCTS, null);
  assert.equal(bad.id, 'Price ID must be PL, PS or PI followed by 6 digits (e.g. PL000123).');
  assert.equal(isSupportBook('PS000005'), true);
  assert.equal(isSupportBook('PI000005'), false);
  assert.equal(isSupportBook('PL000005'), false);
});

test('automatic IDs count per prefix', () => {
  const books = [book('PS000005'), book('PS000010'), book('PL000034')];
  assert.equal(nextPriceBookId(books, 'PS'), 'PS000011');
  assert.equal(nextPriceBookId(books, 'PI'), 'PI000001');
  assert.equal(nextPriceBookId(books), 'PL000035');
});

test('duplicating a PS book gives the copy the next PS number', () => {
  const books = [...SEED_PRICE_BOOKS, book('PS000010')];
  const { book: copy } = expectOk(duplicatePriceBook(books, 'PS000010', 'Lead', now));
  assert.equal(copy.id, 'PS000011');
});

const supportDraft = (id: string, value = '1500'): PriceBookDraft => ({
  ...base(),
  autoId: false,
  id,
  entries: [{ ...base().entries[0], support: value }],
});

test('PS entries keep Support and PL entries drop it on save', () => {
  const ps = expectOk(savePriceBook([], supportDraft('PS000077'), null, PRODUCTS, 'x', now)).book;
  assert.equal(ps.entries[0].support, 1500);
  const pl = expectOk(savePriceBook([], supportDraft('PL000077'), null, PRODUCTS, 'x', now)).book;
  assert.equal('support' in pl.entries[0], false);
});

test('invalid Support blocks saving', () => {
  const draft = supportDraft('PS000077', '-5');
  const errors = validatePriceBook(draft, [], PRODUCTS, null);
  assert.deepEqual(errors.entries['4800000100011'], [
    'Support must be zero or more with up to 2 decimals.',
  ]);
  expectFail(savePriceBook([], draft, null, PRODUCTS, 'x', now));
});

test('duplicate copies Support to the next PS number', () => {
  const { book: ps, books } = expectOk(
    savePriceBook([], supportDraft('PS000077'), null, PRODUCTS, 'x', now),
  );
  const { book: copy } = expectOk(duplicatePriceBook(books, ps.id, 'x', now));
  assert.equal(copy.id, 'PS000078');
  assert.equal(copy.entries[0].support, 1500);
});

test('manual products accept Qty 0 and store no typed margin', () => {
  const entry = manualEntry();
  entry.manual = { ...entry.manual, qty: '0', toQty: '99999' };
  const draft = { ...base(), entries: [entry] };
  assert.equal(hasErrors(validatePriceBook(draft, [], PRODUCTS, null)), false);
  const { book } = expectOk(savePriceBook([], draft, null, PRODUCTS, 'x', now));
  assert.equal(book.entries[0].manual!.qty, 0);
  assert.equal('margin' in book.entries[0].manual!, false);
});

test('support list holds PS entries with Support only, active or not', () => {
  const entry = (productId: string, support?: number) => ({
    productId,
    updatedPrice: 100,
    promoPrice: null,
    effectiveStart: '2026-11-01',
    effectiveEnd: null,
    memo: '',
    ...(support !== undefined ? { support } : {}),
  });
  const ps = { ...book('PS000015'), active: false, entries: [entry('A', 500), entry('B')] };
  const pl = { ...book('PL000001'), entries: [entry('C', 100)] };
  assert.deepEqual(supportList([ps, pl]), [
    { priceId: 'PS000015', productId: 'A', support: '500.00' },
  ]);
});
