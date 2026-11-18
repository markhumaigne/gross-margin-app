import { productIdKey } from './manual-products';
import { isSupportBook, PriceBook } from './price-books';
import { PriceBookEntry } from './pricing';
import { ZenposPriceBook } from './zenpos-price-book';

export interface BookImportSummary {
  fileName: string;
  priceId: string;
  created: boolean;
  products: number;
  added: number;
  removed: number;
  pricesChanged: number;
  supportKept: number;
  skippedRows: number;
}

const MAX_NAME = 80;

function bookName(books: readonly PriceBook[], parsed: ZenposPriceBook): string {
  const base = (parsed.name.trim() || parsed.priceId).slice(0, MAX_NAME);
  const taken = books.some(
    (b) =>
      b.id.toUpperCase() !== parsed.priceId && b.name.trim().toLowerCase() === base.toLowerCase(),
  );
  if (!taken) return base;
  const suffix = ` (${parsed.priceId})`;
  return base.slice(0, MAX_NAME - suffix.length) + suffix;
}

/**
 * Creates or updates the price book named by a ZenPOS export. ZenPOS is the source of truth for
 * prices, cost, dates, name, memo and the active flag; the Support, row memo and master list price
 * entered in this app are kept for products still in the file. Other books are never touched.
 */
export function applyZenposPriceBook(
  books: readonly PriceBook[],
  parsed: ZenposPriceBook,
  fileName: string,
  today: string,
  now: Date,
  actor: string,
): { books: PriceBook[]; book: PriceBook; summary: BookImportSummary } {
  const index = books.findIndex((b) => b.id.toUpperCase() === parsed.priceId);
  const existing = index >= 0 ? books[index] : undefined;
  const effectiveDate = parsed.period?.start ?? existing?.effectiveDate ?? today;
  const expirationDate = parsed.period?.end ?? null;
  const keepSupport = isSupportBook(parsed.priceId);
  const previous = new Map(existing?.entries.map((e) => [productIdKey(e.productId), e]) ?? []);

  let added = 0;
  let pricesChanged = 0;
  let supportKept = 0;
  const entries = parsed.products.map((p): PriceBookEntry => {
    const old = previous.get(productIdKey(p.productId));
    if (!old) added++;
    else if ((old.promoPrice ?? old.updatedPrice) !== p.netPrice) pricesChanged++;
    const support = keepSupport ? old?.support : undefined;
    if (support !== undefined) supportKept++;
    return {
      productId: p.productId,
      updatedPrice: p.netPrice,
      promoPrice: null,
      effectiveStart: effectiveDate,
      effectiveEnd: expirationDate,
      memo: old?.memo ?? '',
      manual: {
        name: p.name,
        qty: p.qty,
        toQty: p.toQty,
        unit: p.unit,
        masterListPrice: old?.manual?.masterListPrice ?? p.unitPrice,
        unitPrice: p.unitPrice,
        discountPercent: p.discountPercent,
        discount: p.discount,
        netPrice: p.netPrice,
        cost: p.cost,
      },
      ...(support !== undefined ? { support } : {}),
    };
  });

  const book: PriceBook = {
    id: parsed.priceId,
    name: bookName(books, parsed),
    description: parsed.memo,
    effectiveDate,
    expirationDate,
    active: parsed.active,
    entries,
    updatedAt: now.toISOString(),
    updatedBy: actor,
  };
  return {
    books: existing ? books.map((b, i) => (i === index ? book : b)) : [...books, book],
    book,
    summary: {
      fileName,
      priceId: parsed.priceId,
      created: !existing,
      products: entries.length,
      added,
      removed: (existing?.entries.length ?? 0) - (entries.length - added),
      pricesChanged,
      supportKept,
      skippedRows: parsed.skippedRows,
    },
  };
}

/** One line per imported file, e.g. "PS000005 updated: 2 added, 1 removed, …". */
export function formatImportSummary(s: BookImportSummary): string {
  const n = (value: number) => value.toLocaleString('en-US');
  const main = s.created
    ? `${s.priceId} created: ${n(s.products)} products`
    : `${s.priceId} updated: ${n(s.added)} added, ${n(s.removed)} removed, ` +
      `${n(s.pricesChanged)} prices changed` +
      (isSupportBook(s.priceId) ? `, Support kept on ${n(s.supportKept)}` : '');
  return s.skippedRows > 0 ? `${main}; ${n(s.skippedRows)} rows skipped` : main;
}
