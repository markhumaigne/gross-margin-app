import {
  MANUAL_PRODUCT_FIELDS,
  ManualProduct,
  manualProductToDraft,
  validateManualProduct,
} from '../../../../shared/domain/manual-products';
import { parseMoney } from '../../../../shared/domain/money';
import { PriceBook, PRICE_ID_PATTERN } from '../../../../shared/domain/price-books';
import { Product } from '../../../../shared/domain/pricing';
import { fail, ok, Result } from '../../../../shared/domain/result';

/** One snapshot keeps imported catalog records and their price-book entries together. */
export interface PricingSnapshot {
  version: 1;
  books: readonly PriceBook[];
  products: readonly Product[];
}

export const PRICING_STORAGE_KEY = 'ledger.pricing.v1';
const unreadable =
  'Saved price books could not be read. Existing browser data has been kept; no changes were saved.';
type ObjectValue = Record<string, unknown>;
const record = (value: unknown): value is ObjectValue =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const strings = (value: ObjectValue, keys: readonly string[]) =>
  keys.every((key) => typeof value[key] === 'string');
const amount = (value: unknown) =>
  typeof value === 'number' && value >= 0 && parseMoney(value) !== null;
const nullableAmount = (value: unknown) => value === null || amount(value);

function validManual(value: unknown): boolean {
  if (!record(value)) return false;
  if (
    !MANUAL_PRODUCT_FIELDS.every((field) =>
      field.kind === 'text'
        ? typeof value[field.key] === 'string'
        : (field.key === 'toQty' && value[field.key] === null) ||
          (typeof value[field.key] === 'number' && Number.isFinite(value[field.key])),
    )
  )
    return false;
  return (
    Object.keys(
      validateManualProduct('saved', manualProductToDraft(value as unknown as ManualProduct)),
    ).length === 0
  );
}

/** Support is pesos per unit. */
const validSupport = (value: unknown) => value === undefined || amount(value);

/**
 * Support was briefly saved as { kind: 'amount' | 'percent', value } before it became pesos per
 * unit only. Peso amounts are kept; percent Support has no peso value and is dropped.
 */
function upgradeLegacySupport(value: unknown): unknown {
  if (!record(value) || !Array.isArray(value.books)) return value;
  for (const book of value.books) {
    if (!record(book) || !Array.isArray(book.entries)) continue;
    for (const entry of book.entries) {
      if (!record(entry) || !record(entry.support)) continue;
      if (entry.support.kind === 'amount') entry.support = entry.support.value;
      else delete entry.support;
    }
  }
  return value;
}

function validEntry(value: unknown): boolean {
  return (
    record(value) &&
    strings(value, ['productId', 'effectiveStart', 'memo']) &&
    (value.effectiveEnd === null || typeof value.effectiveEnd === 'string') &&
    nullableAmount(value.updatedPrice) &&
    nullableAmount(value.promoPrice) &&
    (value.manual === undefined || validManual(value.manual)) &&
    validSupport(value.support)
  );
}

function validBook(value: unknown): boolean {
  return (
    record(value) &&
    strings(value, ['id', 'name', 'description', 'effectiveDate', 'updatedAt', 'updatedBy']) &&
    PRICE_ID_PATTERN.test(value.id as string) &&
    typeof value.active === 'boolean' &&
    (value.expirationDate === null || typeof value.expirationDate === 'string') &&
    Array.isArray(value.entries) &&
    value.entries.every(validEntry)
  );
}

function validProduct(value: unknown): boolean {
  return (
    record(value) &&
    strings(value, ['id', 'name', 'unit']) &&
    (value.onHand === null ||
      (typeof value.onHand === 'number' && Number.isFinite(value.onHand))) &&
    amount(value.masterListPrice) &&
    amount(value.sellingPrice) &&
    nullableAmount(value.cost) &&
    (value.source === undefined || value.source === 'demo' || value.source === 'import')
  );
}

function validSnapshot(value: unknown): value is PricingSnapshot {
  return (
    record(value) &&
    value.version === 1 &&
    Array.isArray(value.books) &&
    Array.isArray(value.products) &&
    value.books.every(validBook) &&
    value.products.every(validProduct)
  );
}

export function readPricingStorage(
  storage: () => Pick<Storage, 'getItem'>,
): Result<PricingSnapshot | null> {
  let text: string | null;
  try {
    text = storage().getItem(PRICING_STORAGE_KEY);
  } catch {
    return fail(
      'Cannot read browser storage. Enable browser storage to load and save price books.',
    );
  }
  if (text === null) return ok(null);
  try {
    const value = upgradeLegacySupport(JSON.parse(text));
    if (!validSnapshot(value)) return fail(unreadable);
    return ok(value);
  } catch {
    return fail(unreadable);
  }
}

export function writePricingStorage(
  storage: () => Pick<Storage, 'setItem'>,
  value: PricingSnapshot,
): Result<void> {
  if (!validSnapshot(value))
    return fail(
      'Price books were not saved because the pricing data is invalid. Existing saved data has been kept.',
    );
  try {
    storage().setItem(PRICING_STORAGE_KEY, JSON.stringify(value));
    return ok(undefined);
  } catch {
    return fail(
      'Price books were not saved. Browser storage is unavailable or full. Keep this page open and try again.',
    );
  }
}
