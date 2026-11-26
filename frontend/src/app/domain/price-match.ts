import { isSupportBook, normalizePriceId, PriceBook } from '../../../../shared/domain/price-books';
import { priceSource } from '../../../../shared/domain/pricing';
import { Support } from '../../../../shared/domain/support';

export type PriceMatchStatus = 'matched' | 'not-found' | 'inactive' | 'not-in-book';

export interface PriceMatch {
  status: PriceMatchStatus;
  price: number | null;
  source: 'promo' | 'updated' | 'master' | null;
  /** Support of the product's entry in a PS book, even when that book is inactive. */
  support: Support | null;
}

export const PRICE_MATCH_LABELS: Record<PriceMatchStatus, string> = {
  matched: 'Matched',
  'not-found': 'Price ID not found',
  inactive: 'Price book inactive',
  'not-in-book': 'Product not in price book',
};

/**
 * Looks up the price a sale should have had under the Price ID the POS recorded. The price is the
 * entry's promotional price, else its updated price, else the master price recorded in the sale
 * (price books never store master prices). Validity dates are not checked: the POS applied the ID.
 * Support from a PS book still applies after the book is deactivated: sales made under its Price ID
 * still earn the supplier's support.
 */
export function matchPriceBook(
  books: readonly PriceBook[],
  priceId: string,
  productId: string,
  masterPrice: number | null,
): PriceMatch {
  const id = normalizePriceId(priceId);
  const book = books.find((b) => b.id.toUpperCase() === id);
  if (!book) return { status: 'not-found', price: null, source: null, support: null };
  const key = productId.trim().toUpperCase();
  const entry = book.entries.find((e) => e.productId.trim().toUpperCase() === key);
  const support = entry?.support !== undefined && isSupportBook(book.id) ? entry.support : null;
  if (!book.active) return { status: 'inactive', price: null, source: null, support };
  if (!entry) return { status: 'not-in-book', price: null, source: null, support: null };
  const source = priceSource(entry);
  const price = entry.promoPrice ?? entry.updatedPrice ?? masterPrice;
  if (price === null) return { status: 'matched', price: null, source: null, support };
  return { status: 'matched', price, source, support };
}
