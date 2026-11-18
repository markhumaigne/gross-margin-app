import { isIsoDate } from './dates';
import { productIdKey } from './manual-products';
import { isBlank, parseMoney } from './money';
import { normalizePriceId, PRICE_ID_PATTERN } from './price-books';
import { fail, ok, Result } from './result';

/** One product row of a ZenPOS "Price Book" export, as the price book will store it. */
export interface ZenposProductRow {
  productId: string;
  name: string;
  qty: number;
  toQty: number | null;
  unit: string;
  unitPrice: number;
  discount: number;
  discountPercent: number;
  netPrice: number;
  cost: number;
}

/** A ZenPOS "Price Book" export: one price book per file. */
export interface ZenposPriceBook {
  priceId: string;
  name: string;
  active: boolean;
  memo: string;
  /** From "Limited Period"; null when the period is not limited. ISO dates. */
  period: { start: string; end: string } | null;
  products: ZenposProductRow[];
  skippedRows: number;
}

export const NOT_A_PRICE_BOOK =
  'This file is not a ZenPOS price book export (no Price ID or product header found).';

type Label = 'priceid' | 'name' | 'active' | 'memo' | 'limitedperiod';
const LABELS: readonly Label[] = ['priceid', 'name', 'active', 'memo', 'limitedperiod'];
const REQUIRED_HEADERS = ['productid', 'unitprice', 'priceafterdiscount', 'stndcost'];
const COLUMNS = [
  'productid',
  'name',
  'qty',
  'toqty',
  'unit',
  'unitprice',
  'discount',
  'disc',
  'priceafterdiscount',
  'stndcost',
] as const;
type Column = (typeof COLUMNS)[number];

const normalize = (value: unknown) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
const text = (value: unknown) =>
  isBlank(value) ? '' : String(value).replace(/\r\n?/g, '\n').trim();

/**
 * Product IDs are barcodes. Excel stores most as numbers (shown as 5.70712E+12), so numbers are
 * converted from the raw value, never the displayed text. Text IDs keep their leading zeros.
 */
export function zenposProductId(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  return String(value).trim();
}

function quantity(value: unknown): number | null {
  if (isBlank(value)) return null;
  const number = typeof value === 'number' ? value : Number(String(value).replace(/,/g, ''));
  return Number.isFinite(number) && number >= 0 && number <= Number.MAX_SAFE_INTEGER
    ? number
    : null;
}

function amount(value: unknown): number | null {
  const parsed = parseMoney(value);
  return parsed !== null && parsed >= 0 ? parsed : null;
}

/** "Yes (11/06/2026~11/19/2026)" → ISO dates; anything else (including "No") → null. */
function parsePeriod(value: unknown): ZenposPriceBook['period'] {
  const match =
    /^yes\s*\(\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*~\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*\)/i.exec(
      text(value),
    );
  if (!match) return null;
  const iso = (m: string, d: string, y: string) =>
    `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  const start = iso(match[1], match[2], match[3]);
  const end = iso(match[4], match[5], match[6]);
  return isIsoDate(start) && isIsoDate(end) && end >= start ? { start, end } : null;
}

export function parseZenposPriceBook(rows: readonly unknown[][]): Result<ZenposPriceBook> {
  const headerRow = rows.findIndex((row) => {
    const cells = (row ?? []).map(normalize);
    return REQUIRED_HEADERS.every((h) => cells.includes(h));
  });
  if (headerRow < 0) return fail(NOT_A_PRICE_BOOK);

  const labels = new Map<Label, unknown>();
  for (const row of rows.slice(0, headerRow)) {
    const label = normalize(row?.[0]) as Label;
    if (LABELS.includes(label) && !labels.has(label)) labels.set(label, row?.[1]);
  }
  const priceId = normalizePriceId(labels.get('priceid'));
  if (!priceId) return fail(NOT_A_PRICE_BOOK);
  if (!PRICE_ID_PATTERN.test(priceId))
    return fail(`Price ID ${priceId} is not PL, PS or PI followed by 6 digits.`);

  const index = new Map<Column, number>();
  rows[headerRow].forEach((cell, i) => {
    const key = normalize(cell) as Column;
    if (COLUMNS.includes(key) && !index.has(key)) index.set(key, i);
  });
  const cell = (row: readonly unknown[], column: Column) => {
    const i = index.get(column);
    return i === undefined ? null : row[i];
  };

  const products: ZenposProductRow[] = [];
  const seen = new Set<string>();
  let skippedRows = 0;
  for (const row of rows.slice(headerRow + 1)) {
    if (!row || row.every((c) => isBlank(c))) continue;
    const productId = zenposProductId(cell(row, 'productid'));
    const netPrice = amount(cell(row, 'priceafterdiscount'));
    const cost = amount(cell(row, 'stndcost'));
    if (!productId || netPrice === null || cost === null || seen.has(productIdKey(productId))) {
      skippedRows++;
      continue;
    }
    seen.add(productIdKey(productId));
    const qty = quantity(cell(row, 'qty')) ?? 0;
    const toQty = quantity(cell(row, 'toqty'));
    const discountPercent = amount(cell(row, 'disc'));
    products.push({
      productId,
      name: text(cell(row, 'name')) || productId,
      qty,
      toQty: toQty !== null && toQty >= qty ? toQty : null,
      unit: text(cell(row, 'unit')) || 'PCS',
      unitPrice: amount(cell(row, 'unitprice')) ?? netPrice,
      discount: amount(cell(row, 'discount')) ?? 0,
      discountPercent: discountPercent !== null && discountPercent <= 100 ? discountPercent : 0,
      netPrice,
      cost,
    });
  }
  if (!products.length) return fail('The price book has no product rows.');

  return ok({
    priceId,
    name: text(labels.get('name')),
    active: /^yes$/i.test(text(labels.get('active'))),
    memo: text(labels.get('memo')),
    period: parsePeriod(labels.get('limitedperiod')),
    products,
    skippedRows,
  });
}
