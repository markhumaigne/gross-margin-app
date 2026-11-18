import assert from 'node:assert/strict';
import { test } from './harness';
import { parseMoney } from '../src/app/domain/money';
import {
  discountPercent,
  effectivePrice,
  entryFromDraft,
  entryStatus,
  PriceBookEntryDraft,
  priceSource,
  searchProducts,
  validateEntryDraft,
} from '../src/app/domain/pricing';
import { PRODUCTS } from '../src/app/mock-data/products';

const p1 = PRODUCTS.find((p) => p.id === '4800000100011')!;
const book = { effectiveDate: '2026-11-01', expirationDate: '2026-11-30' };
const draft = (o: Partial<PriceBookEntryDraft> = {}): PriceBookEntryDraft => ({
  productId: p1.id,
  updatedPrice: '',
  promoPrice: '',
  effectiveStart: '2026-11-01',
  effectiveEnd: '2026-11-30',
  memo: '',
  ...o,
});

test('effective price prefers promo, then updated, then master', () => {
  assert.equal(effectivePrice(p1, { updatedPrice: null, promoPrice: null }), 5795);
  assert.equal(effectivePrice(p1, { updatedPrice: 5495, promoPrice: null }), 5495);
  assert.equal(effectivePrice(p1, { updatedPrice: 5495, promoPrice: 4995 }), 4995);
  assert.equal(priceSource({ updatedPrice: 5495, promoPrice: null }), 'updated');
});

test('discount percentages', () => {
  assert.equal(discountPercent(5795, 4995), 13.81);
  assert.equal(discountPercent(5795, 5495), 5.18);
  assert.equal(discountPercent(1000, 1100), -10);
  assert.equal(discountPercent(0, 10), null);
});

test('entry status from validity dates (inclusive)', () => {
  const t = '2026-11-17';
  assert.equal(entryStatus({ effectiveStart: '2026-11-18', effectiveEnd: null }, t), 'Scheduled');
  assert.equal(
    entryStatus({ effectiveStart: '2026-11-01', effectiveEnd: '2026-11-16' }, t),
    'Expired',
  );
  assert.equal(
    entryStatus({ effectiveStart: '2026-11-01', effectiveEnd: '2026-11-17' }, t),
    'Active',
  );
  assert.equal(entryStatus({ effectiveStart: '2026-11-17', effectiveEnd: null }, t), 'Active');
});

test('valid entries, including peso-formatted input', () => {
  assert.deepEqual(
    validateEntryDraft(draft({ updatedPrice: '₱5,495.00', promoPrice: '4,995' }), p1, book),
    [],
  );
  assert.deepEqual(validateEntryDraft(draft(), p1, book), []);
  assert.deepEqual(entryFromDraft(draft({ updatedPrice: '₱5,495.00', memo: ' x ' })), {
    productId: p1.id,
    updatedPrice: 5495,
    promoPrice: null,
    effectiveStart: '2026-11-01',
    effectiveEnd: '2026-11-30',
    memo: 'x',
  });
});

test('invalid entries report every problem', () => {
  const v = (o: Partial<PriceBookEntryDraft>, b = book) => validateEntryDraft(draft(o), p1, b);
  const updatedMsg = 'Updated selling price must be a positive amount with up to 2 decimals.';
  const promoMsg = 'Promotional price must be a positive amount with up to 2 decimals.';
  assert.deepEqual(v({ updatedPrice: '99.999' }), [updatedMsg]);
  assert.deepEqual(v({ promoPrice: 'abc' }), [promoMsg]);
  assert.deepEqual(v({ promoPrice: '0' }), [promoMsg]);
  assert.deepEqual(v({ updatedPrice: '-5' }), [updatedMsg]);
  assert.deepEqual(v({ updatedPrice: '5000', promoPrice: '5100' }), [
    'Promotional price cannot exceed the updated selling price.',
  ]);
  assert.deepEqual(v({ promoPrice: '6000' }), [
    'Promotional price cannot exceed the master list price.',
  ]);
  assert.deepEqual(
    v(
      { promoPrice: '4995', effectiveEnd: '' },
      { effectiveDate: '2026-11-01', expirationDate: '' },
    ),
    ['Promotional prices need an effective end date.'],
  );
  assert.deepEqual(v({ effectiveEnd: '2026-10-31' }), [
    'Effective end cannot be before effective start.',
  ]);
  assert.deepEqual(v({ effectiveStart: '' }), ['Effective start date is required.']);
  assert.deepEqual(v({ effectiveStart: '2026-10-15' }), [
    'Effective start cannot be before the price book effective date.',
  ]);
  assert.deepEqual(v({ effectiveEnd: '2026-12-15' }), [
    'Effective end must be on or before the price book expiration date.',
  ]);
  assert.deepEqual(validateEntryDraft(draft(), undefined, book), [
    'Product is not in the catalog.',
  ]);
});

test('product search by ID or name and catalog integrity', () => {
  assert.deepEqual(
    searchProducts(PRODUCTS, ' 4800000100028').map((p) => p.id),
    ['4800000100028'],
  );
  assert.ok(searchProducts(PRODUCTS, 'MONITOR').length >= 2);
  assert.equal(searchProducts(PRODUCTS, '').length, PRODUCTS.length);
  assert.equal(new Set(PRODUCTS.map((p) => p.id)).size, PRODUCTS.length);
  assert.ok(PRODUCTS.length >= 20 && PRODUCTS.length <= 26);
  for (const p of PRODUCTS) {
    assert.match(p.id, /^4800\d{9}$/);
    for (const m of [p.masterListPrice, p.sellingPrice, p.cost]) assert.equal(parseMoney(m), m);
  }
});
