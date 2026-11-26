import { isIsoDate } from './dates';
import { parseMoney } from './money';
import {
  ManualProduct,
  ManualProductDraft,
  manualProductFromDraft,
  manualProductToDraft,
  validateManualProduct,
} from './manual-products';
import {
  Support,
  SupportDraft,
  supportFromDraft,
  supportToDraft,
  validateSupportDraft,
} from './support';

export type EntryStatus = 'Active' | 'Scheduled' | 'Expired';

/**
 * A product inside one price book. Every entry carries its own product details, from a ZenPOS
 * price book import or manual entry; the price is the details' net price.
 */
export interface PriceBookEntry {
  manual: ManualProduct;
  productId: string;
  updatedPrice: number | null;
  promoPrice: number | null;
  effectiveStart: string;
  effectiveEnd: string | null;
  memo: string;
  /** Supplier Support; only kept on PS (external promotion) price books. */
  support?: Support;
}

/** Editable form values for an entry; prices are kept as typed until validated. */
export interface PriceBookEntryDraft {
  manual: ManualProductDraft;
  productId: string;
  updatedPrice: string;
  promoPrice: string;
  effectiveStart: string;
  effectiveEnd: string;
  memo: string;
  support?: SupportDraft;
}

type EntryPrices = Pick<PriceBookEntry, 'updatedPrice' | 'promoPrice'>;

export function priceSource(entry: EntryPrices): 'promo' | 'updated' | 'master' {
  if (entry.promoPrice !== null) return 'promo';
  if (entry.updatedPrice !== null) return 'updated';
  return 'master';
}

export function entryStatus(
  entry: Pick<PriceBookEntry, 'effectiveStart' | 'effectiveEnd'>,
  today: string,
): EntryStatus {
  if (entry.effectiveStart > today) return 'Scheduled';
  if (entry.effectiveEnd && entry.effectiveEnd < today) return 'Expired';
  return 'Active';
}

export function validateEntryDraft(
  draft: PriceBookEntryDraft,
  book: { effectiveDate: string; expirationDate: string },
): string[] {
  const errors: string[] = [];
  errors.push(...Object.values(validateManualProduct(draft.productId, draft.manual)));
  if (draft.support !== undefined) {
    const supportError = validateSupportDraft(draft.support);
    if (supportError) errors.push(supportError);
  }
  const startValid = isIsoDate(draft.effectiveStart);
  const endBlank = !draft.effectiveEnd.trim();
  const endValid = !endBlank && isIsoDate(draft.effectiveEnd);
  if (!startValid) errors.push('Effective start date is required.');
  if (!endBlank && !endValid) errors.push('Effective end must be a valid date.');
  if (startValid && endValid && draft.effectiveEnd < draft.effectiveStart)
    errors.push('Effective end cannot be before effective start.');
  if (startValid && isIsoDate(book.effectiveDate) && draft.effectiveStart < book.effectiveDate)
    errors.push('Effective start cannot be before the price book effective date.');
  if (
    isIsoDate(book.expirationDate) &&
    (endBlank || (endValid && draft.effectiveEnd > book.expirationDate))
  )
    errors.push('Effective end must be on or before the price book expiration date.');
  return errors;
}

/** Converts a validated draft. The price is the product's net price; blank Support is left out. */
export function entryFromDraft(draft: PriceBookEntryDraft): PriceBookEntry {
  const support = supportFromDraft(draft.support);
  return {
    productId: draft.productId.trim(),
    updatedPrice: parseMoney(draft.manual.netPrice),
    promoPrice: null,
    manual: manualProductFromDraft(draft.manual),
    effectiveStart: draft.effectiveStart,
    effectiveEnd: draft.effectiveEnd.trim() ? draft.effectiveEnd : null,
    memo: draft.memo.trim(),
    ...(support !== undefined ? { support } : {}),
  };
}

export function entryToDraft(entry: PriceBookEntry): PriceBookEntryDraft {
  return {
    productId: entry.productId,
    manual: manualProductToDraft(entry.manual),
    updatedPrice: entry.updatedPrice === null ? '' : entry.updatedPrice.toFixed(2),
    promoPrice: entry.promoPrice === null ? '' : entry.promoPrice.toFixed(2),
    effectiveStart: entry.effectiveStart,
    effectiveEnd: entry.effectiveEnd ?? '',
    memo: entry.memo,
    ...(entry.support !== undefined ? { support: supportToDraft(entry.support) } : {}),
  };
}
