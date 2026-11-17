import { isIsoDate } from './dates';
import { isBlank, parseMoney, percentOf, toCents } from './money';

export interface Product {
  id: string;
  name: string;
  unit: string;
  onHand: number;
  /** Original catalog price. Price books never write to it. */
  masterListPrice: number;
  /** Current everyday selling price in the catalog. */
  sellingPrice: number;
  cost: number;
}

export type EntryStatus = 'Active' | 'Scheduled' | 'Expired';

/** A product's prices inside one price book. The master list price stays on the Product. */
export interface PriceBookEntry {
  productId: string;
  updatedPrice: number | null;
  promoPrice: number | null;
  effectiveStart: string;
  effectiveEnd: string | null;
  memo: string;
}

/** Editable form values for an entry; prices are kept as typed until validated. */
export interface PriceBookEntryDraft {
  productId: string;
  updatedPrice: string;
  promoPrice: string;
  effectiveStart: string;
  effectiveEnd: string;
  memo: string;
}

type EntryPrices = Pick<PriceBookEntry, 'updatedPrice' | 'promoPrice'>;

export function priceSource(entry: EntryPrices): 'promo' | 'updated' | 'master' {
  if (entry.promoPrice !== null) return 'promo';
  if (entry.updatedPrice !== null) return 'updated';
  return 'master';
}

export function effectivePrice(
  product: Pick<Product, 'masterListPrice'>,
  entry: EntryPrices,
): number {
  return entry.promoPrice ?? entry.updatedPrice ?? product.masterListPrice;
}

/** Discount from the master list price; negative values are a markup. */
export function discountPercent(masterListPrice: number, price: number): number | null {
  if (masterListPrice <= 0) return null;
  return percentOf(toCents(masterListPrice) - toCents(price), toCents(masterListPrice));
}

export function marginPercent(price: number, cost: number): number | null {
  if (price <= 0) return null;
  return percentOf(toCents(price) - toCents(cost), toCents(price));
}

export function entryStatus(
  entry: Pick<PriceBookEntry, 'effectiveStart' | 'effectiveEnd'>,
  today: string,
): EntryStatus {
  if (entry.effectiveStart > today) return 'Scheduled';
  if (entry.effectiveEnd && entry.effectiveEnd < today) return 'Expired';
  return 'Active';
}

function positivePrice(text: string): number | null {
  const value = parseMoney(text);
  return value !== null && value > 0 ? value : null;
}

export function validateEntryDraft(
  draft: PriceBookEntryDraft,
  product: Product | undefined,
  book: { effectiveDate: string; expirationDate: string },
): string[] {
  const errors: string[] = [];
  if (!product) errors.push('Product is not in the catalog.');

  const updated = isBlank(draft.updatedPrice) ? null : positivePrice(draft.updatedPrice);
  const promo = isBlank(draft.promoPrice) ? null : positivePrice(draft.promoPrice);
  if (!isBlank(draft.updatedPrice) && updated === null)
    errors.push('Updated selling price must be a positive amount with up to 2 decimals.');
  if (!isBlank(draft.promoPrice) && promo === null)
    errors.push('Promotional price must be a positive amount with up to 2 decimals.');
  if (promo !== null) {
    if (updated !== null) {
      if (promo > updated)
        errors.push('Promotional price cannot exceed the updated selling price.');
    } else if (product && promo > product.masterListPrice) {
      errors.push('Promotional price cannot exceed the master list price.');
    }
  }

  const startValid = isIsoDate(draft.effectiveStart);
  const endBlank = !draft.effectiveEnd.trim();
  const endValid = !endBlank && isIsoDate(draft.effectiveEnd);
  if (!startValid) errors.push('Effective start date is required.');
  if (!endBlank && !endValid) errors.push('Effective end must be a valid date.');
  if (startValid && endValid && draft.effectiveEnd < draft.effectiveStart)
    errors.push('Effective end cannot be before effective start.');
  if (promo !== null && endBlank) errors.push('Promotional prices need an effective end date.');
  if (startValid && isIsoDate(book.effectiveDate) && draft.effectiveStart < book.effectiveDate)
    errors.push('Effective start cannot be before the price book effective date.');
  if (
    isIsoDate(book.expirationDate) &&
    (endBlank || (endValid && draft.effectiveEnd > book.expirationDate))
  )
    errors.push('Effective end must be on or before the price book expiration date.');
  return errors;
}

/** Converts a validated draft. Blank prices become null. */
export function entryFromDraft(draft: PriceBookEntryDraft): PriceBookEntry {
  return {
    productId: draft.productId,
    updatedPrice: isBlank(draft.updatedPrice) ? null : parseMoney(draft.updatedPrice),
    promoPrice: isBlank(draft.promoPrice) ? null : parseMoney(draft.promoPrice),
    effectiveStart: draft.effectiveStart,
    effectiveEnd: draft.effectiveEnd.trim() ? draft.effectiveEnd : null,
    memo: draft.memo.trim(),
  };
}

export function entryToDraft(entry: PriceBookEntry): PriceBookEntryDraft {
  return {
    productId: entry.productId,
    updatedPrice: entry.updatedPrice === null ? '' : entry.updatedPrice.toFixed(2),
    promoPrice: entry.promoPrice === null ? '' : entry.promoPrice.toFixed(2),
    effectiveStart: entry.effectiveStart,
    effectiveEnd: entry.effectiveEnd ?? '',
    memo: entry.memo,
  };
}

export function searchProducts(products: readonly Product[], query: string): Product[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...products];
  return products.filter((p) => p.id.toLowerCase().includes(q) || p.name.toLowerCase().includes(q));
}
