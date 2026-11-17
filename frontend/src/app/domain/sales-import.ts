import { parseReportDate } from './dates';
import { isBlank, parseMoney } from './money';
import { normalizePriceId, PRICE_ID_PATTERN, PriceBook } from './price-books';
import { PriceBookEntry, Product } from './pricing';
import { fail, ok, Result } from './result';
import {
  detectMapping,
  findHeaderRow,
  isFooterRow,
  normalizeProductId,
  parseQuantity,
} from './sales-report';

export interface ImportSummary {
  fileName: string;
  productsAdded: number;
  productsAlreadyInCatalog: number;
  productsWithoutPrice: number;
  booksCreated: string[];
  booksExtended: { id: string; added: number }[];
}

interface SeenProduct {
  id: string;
  name: string;
  unit: string;
  master: number | null;
  regularSelling: number | null;
  anySelling: number | null;
  cost: number | null;
}

const NO_COLUMNS = 'This file has no Product ID and price columns.';

const positive = (value: number | null) => (value !== null && value > 0 ? value : null);

function mostFrequent(counts: Map<number, number>): number {
  let best = 0;
  let bestCount = 0;
  for (const [value, count] of counts)
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  return best;
}

/**
 * Imports products and price lists from a POS "Sales Report by Product" export. Products already in
 * the catalog and entries already in a price book are never changed; only missing ones are added.
 * Each Price ID becomes a price book holding the POS Selling Price recorded for each product.
 */
export function importFromExport(
  rows: readonly unknown[][],
  fileName: string,
  today: string,
  catalog: readonly Product[],
  books: readonly PriceBook[],
  now: Date,
  actor: string,
): Result<{ products: Product[]; books: PriceBook[]; summary: ImportSummary }> {
  const headerRow = findHeaderRow(rows);
  if (headerRow < 0) return fail(NO_COLUMNS);
  const { mapping } = detectMapping(rows[headerRow]);
  if (mapping.productId === null || (mapping.masterPrice === null && mapping.sellingPrice === null))
    return fail(NO_COLUMNS);
  const cell = (row: readonly unknown[], field: keyof typeof mapping) =>
    mapping[field] === null ? null : row[mapping[field]!];

  const seen = new Map<string, SeenProduct>();
  const lists = new Map<string, Map<string, Map<number, number>>>();
  let reportDate: string | null = null;

  for (let i = headerRow + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every((c) => isBlank(c)) || isFooterRow(row, mapping)) continue;
    const id = normalizeProductId(cell(row, 'productId'));
    if (!id) continue;
    reportDate ??= parseReportDate(cell(row, 'date'));
    const key = id.toUpperCase();
    const product = seen.get(key) ?? {
      id,
      name: '',
      unit: '',
      master: null,
      regularSelling: null,
      anySelling: null,
      cost: null,
    };
    const name = String(cell(row, 'productName') ?? '').trim();
    const unit = String(cell(row, 'unit') ?? '').trim();
    if (!product.name && name) product.name = name;
    if (!product.unit && unit) product.unit = unit;
    product.master ??= positive(parseMoney(cell(row, 'masterPrice')));
    const selling = positive(parseMoney(cell(row, 'sellingPrice')));
    const priceId = normalizePriceId(cell(row, 'priceId'));
    product.anySelling ??= selling;
    if (!priceId) product.regularSelling ??= selling;
    const cost = parseMoney(cell(row, 'cost'));
    if (product.cost === null && cost !== null && cost >= 0) product.cost = cost;
    seen.set(key, product);

    const quantity = mapping.quantity === null ? 1 : parseQuantity(cell(row, 'quantity'));
    if (priceId && selling !== null && quantity !== null && quantity > 0) {
      const perProduct = lists.get(priceId) ?? new Map<string, Map<number, number>>();
      const counts = perProduct.get(key) ?? new Map<number, number>();
      counts.set(selling, (counts.get(selling) ?? 0) + 1);
      perProduct.set(key, counts);
      lists.set(priceId, perProduct);
    }
  }

  const summary: ImportSummary = {
    fileName,
    productsAdded: 0,
    productsAlreadyInCatalog: 0,
    productsWithoutPrice: 0,
    booksCreated: [],
    booksExtended: [],
  };
  const byKey = new Map(catalog.map((p) => [p.id.toUpperCase(), p]));
  const added: Product[] = [];
  for (const [key, s] of seen) {
    const master = s.master ?? s.anySelling;
    if (master === null) {
      summary.productsWithoutPrice++;
      continue;
    }
    if (byKey.has(key)) {
      summary.productsAlreadyInCatalog++;
      continue;
    }
    const product: Product = {
      id: s.id,
      name: s.name || s.id,
      unit: s.unit || 'PCS',
      onHand: null,
      masterListPrice: master,
      sellingPrice: s.regularSelling ?? master,
      cost: s.cost,
      source: 'import',
    };
    added.push(product);
    byKey.set(key, product);
  }
  summary.productsAdded = added.length;

  const date = reportDate ?? today;
  const stamp = { updatedAt: now.toISOString(), updatedBy: actor };
  const nextBooks = [...books];
  for (const priceId of [...lists.keys()].sort()) {
    if (!PRICE_ID_PATTERN.test(priceId)) continue;
    const isPromoList = priceId.startsWith('PS');
    const index = nextBooks.findIndex((b) => b.id.toUpperCase() === priceId);
    const existing = index >= 0 ? nextBooks[index] : undefined;
    const have = new Set(existing?.entries.map((e) => e.productId.trim().toUpperCase()) ?? []);
    let start = existing && existing.effectiveDate > date ? existing.effectiveDate : date;
    if (existing?.expirationDate && start > existing.expirationDate)
      start = existing.expirationDate;
    const entries: PriceBookEntry[] = [];
    for (const [key, counts] of lists.get(priceId)!) {
      const product = byKey.get(key);
      if (!product || have.has(key)) continue;
      const price = mostFrequent(counts);
      const promo = isPromoList && price <= product.masterListPrice;
      const end = existing
        ? (existing.expirationDate ?? (promo ? start : null))
        : isPromoList
          ? date
          : null;
      entries.push({
        productId: product.id,
        updatedPrice: promo ? null : price,
        promoPrice: promo ? price : null,
        effectiveStart: start,
        effectiveEnd: end,
        memo: '',
      });
    }
    if (!entries.length) continue;
    if (existing) {
      nextBooks[index] = { ...existing, entries: [...existing.entries, ...entries], ...stamp };
      summary.booksExtended.push({ id: existing.id, added: entries.length });
    } else {
      nextBooks.push({
        id: priceId,
        name: `Imported ${priceId}`,
        description: `Imported from ${fileName} (POS selling prices).`,
        effectiveDate: date,
        expirationDate: isPromoList ? date : null,
        active: true,
        entries,
        ...stamp,
      });
      summary.booksCreated.push(priceId);
    }
  }

  return ok({ products: [...catalog, ...added], books: nextBooks, summary });
}
