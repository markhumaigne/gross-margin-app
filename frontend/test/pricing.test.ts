import assert from 'node:assert/strict';
import { test } from './harness';
import { emptyManualProduct } from '../../shared/domain/manual-products';
import {
  entryFromDraft,
  entryStatus,
  PriceBookEntryDraft,
  priceSource,
  validateEntryDraft,
} from '../../shared/domain/pricing';

const book = { effectiveDate: '2026-11-01', expirationDate: '2026-11-30' };
const draft = (o: Partial<PriceBookEntryDraft> = {}): PriceBookEntryDraft => ({
  productId: '4800000100011',
  manual: {
    ...emptyManualProduct(),
    name: '24" IPS Monitor FHD 100Hz',
    masterListPrice: '₱5,795.00',
    unitPrice: '5,795',
    discountPercent: '3.45',
    discount: '200',
    netPrice: '₱5,595.00',
    cost: '4681',
  },
  updatedPrice: '',
  promoPrice: '',
  effectiveStart: '2026-11-01',
  effectiveEnd: '2026-11-30',
  memo: '',
  ...o,
});

test('price source prefers promo, then updated, then master', () => {
  assert.equal(priceSource({ updatedPrice: 5495, promoPrice: 4995 }), 'promo');
  assert.equal(priceSource({ updatedPrice: 5495, promoPrice: null }), 'updated');
  assert.equal(priceSource({ updatedPrice: null, promoPrice: null }), 'master');
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

test('valid entries take their price from the product details, including peso-formatted input', () => {
  assert.deepEqual(validateEntryDraft(draft(), book), []);
  assert.deepEqual(entryFromDraft(draft({ updatedPrice: '1', promoPrice: '1', memo: ' x ' })), {
    productId: '4800000100011',
    updatedPrice: 5595,
    promoPrice: null,
    manual: {
      name: '24" IPS Monitor FHD 100Hz',
      qty: 1,
      toQty: null,
      unit: 'PCS',
      masterListPrice: 5795,
      unitPrice: 5795,
      discountPercent: 3.45,
      discount: 200,
      netPrice: 5595,
      cost: 4681,
    },
    effectiveStart: '2026-11-01',
    effectiveEnd: '2026-11-30',
    memo: 'x',
  });
});

test('invalid entries report every problem', () => {
  const v = (o: Partial<PriceBookEntryDraft>, b = book) => validateEntryDraft(draft(o), b);
  assert.deepEqual(v({ manual: { ...draft().manual, netPrice: 'abc', unit: ' ' } }), [
    'Unit is required.',
    'Net Price must be zero or more with up to 2 decimals.',
  ]);
  assert.deepEqual(v({ productId: ' ' }), ['Product ID is required.']);
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
});
