import { fromCents, isBlank, parseMoney, percentOf, toCents } from './money';
import { normalizePriceId, PriceBook } from './price-books';
import { matchPriceBook, PriceMatchStatus } from './price-match';
import { saleSupportCents, Support } from './support';

export type SalesField =
  | 'productId'
  | 'productName'
  | 'quantity'
  | 'netSales'
  | 'cost'
  | 'priceId'
  | 'sellingPrice'
  | 'masterPrice'
  | 'unit'
  | 'date'
  | 'invoice';
/** Column index in the header row for each field, or null when not mapped. */
export type ColumnMapping = Record<SalesField, number | null>;
export type CostBasis = 'unit' | 'line';
export type CostSource = 'report' | 'missing';

export const REQUIRED_FIELDS: readonly SalesField[] = ['productId', 'quantity', 'netSales'];

export interface SalesIssue {
  /** 1-based spreadsheet row number. */
  row: number;
  productId: string;
  message: string;
  excluded: boolean;
}

export interface ProductSalesLine {
  productId: string;
  productName: string;
  quantity: number;
  netSales: number;
  cogs: number | null;
  grossProfit: number | null;
  grossMarginPercent: number | null;
  /** Support earned under PS Price IDs (0 when none). */
  support: number;
  /** Net sales − COGS + support; null when cost is missing. */
  grossProfitAfterSupport: number | null;
  grossMarginAfterSupportPercent: number | null;
  costSource: CostSource;
  rowCount: number;
  /** Distinct Price IDs recorded on this product's included rows, sorted. */
  priceIds: string[];
  /** Included rows sold without a Price ID (regular price). */
  regularPriceRows: number;
}

export interface PriceComparisonLine {
  priceId: string;
  productId: string;
  productName: string;
  quantity: number;
  actualNetSales: number;
  /** Most frequent POS Selling Price on these rows, when the export has that column. */
  posSellingPrice: number | null;
  price: number | null;
  priceSource: 'promo' | 'updated' | 'master' | null;
  expectedRevenue: number | null;
  variance: number | null;
  status: PriceMatchStatus;
  support: number;
}

export interface PriceComparison {
  lines: PriceComparisonLine[];
  /** Totals cover matched lines only. */
  matchedLines: number;
  actualNetSales: number;
  expectedRevenue: number;
  variance: number;
  /** Support to claim: every line that earned support, matched or not. */
  support: number;
}

export interface SalesReportTotals {
  quantity: number;
  netSales: number;
  knownCostNetSales: number;
  cogs: number;
  grossProfit: number;
  grossMarginPercent: number | null;
  support: number;
  /** Covers products with a known cost, like gross profit. */
  grossProfitAfterSupport: number;
  grossMarginAfterSupportPercent: number | null;
  productsWithCost: number;
  productsMissingCost: number;
}

export interface SalesReportOptions {
  /** 0-based index of the header row in `rows`. */
  headerRow: number;
  mapping: ColumnMapping;
  costBasis: CostBasis;
}

export interface SalesReportResult {
  lines: ProductSalesLine[];
  issues: SalesIssue[];
  totals: SalesReportTotals;
  dataRows: number;
  includedRows: number;
  excludedRows: number;
  priceComparison: PriceComparison;
}

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
/** Same limits as the backend Sales Report parser. */
export const MAX_DATA_ROWS = 50000;
export const MAX_COLUMNS = 200;
/** Rows read from a sheet: the header may sit in the first 10 rows, plus one row to detect overflow. */
export const READ_ROW_CAP = MAX_DATA_ROWS + 11;

const ALIASES: Record<Exclude<SalesField, 'cost'>, string[]> = {
  productId: ['productid', 'sku', 'itemcode', 'productcode', 'barcode'],
  productName: ['productname', 'itemname', 'product', 'item', 'description', 'name'],
  quantity: ['qty', 'quantity', 'qtysold', 'unitssold'],
  netSales: ['nettotal', 'netsales', 'netamount', 'linetotal', 'salesamount', 'amount', 'total'],
  priceId: ['priceid', 'pricebookid', 'pricelistid', 'pricelist', 'pricebook'],
  sellingPrice: ['sellingprice'],
  masterPrice: ['masterprice'],
  unit: ['unit', 'uom'],
  date: ['date', 'saledate', 'salesdate'],
  invoice: ['tminv', 'invoice', 'invoiceno', 'invoicenumber', 'receipt', 'or'],
};
const LINE_COST_ALIASES = ['totalcost', 'linecost', 'extendedcost', 'cogs'];
const UNIT_COST_ALIASES = ['unitcost', 'costperunit', 'cost'];

const MESSAGES = {
  missingId: 'Missing Product ID.',
  negative: 'Negative quantity or sales (refund/return) excluded from totals.',
  quantity: 'Quantity must be a number greater than zero.',
  netSales: 'Net sales must be a valid amount.',
  invalidCost: 'Cost is invalid; treated as missing.',
  noCost: 'No historical cost in the report; COGS left blank.',
};

const normalizeHeader = (value: unknown) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
const collapse = (value: unknown) =>
  String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();

export function validateUploadFile(name: string, size: number): string | null {
  if (!/\.(csv|xlsx|xls)$/i.test(name)) return 'Upload a .csv, .xlsx or .xls file.';
  if (size === 0) return 'The selected file is empty.';
  if (size > MAX_UPLOAD_BYTES) return 'Files must be 10 MB or smaller.';
  return null;
}

export function hasProductIdHeader(row: readonly unknown[]): boolean {
  return row.some((cell) => ALIASES.productId.includes(normalizeHeader(cell)));
}

const isBlankRow = (row: readonly unknown[] | undefined) => !row || row.every((c) => isBlank(c));

export function findHeaderRow(rows: readonly unknown[][]): number {
  const limit = Math.min(rows.length, 10);
  for (let i = 0; i < limit; i++) if (hasProductIdHeader(rows[i] ?? [])) return i;
  return rows.findIndex((row) => !isBlankRow(row));
}

export function detectMapping(headers: readonly unknown[]): {
  mapping: ColumnMapping;
  costBasis: CostBasis;
} {
  const normalized = headers.map(normalizeHeader);
  const used = new Set<number>();
  const find = (aliases: string[]): number | null => {
    for (const alias of aliases) {
      const index = normalized.findIndex((h, i) => h === alias && !used.has(i));
      if (index >= 0) {
        used.add(index);
        return index;
      }
    }
    return null;
  };
  const productId = find(ALIASES.productId);
  const quantity = find(ALIASES.quantity);
  const netSales = find(ALIASES.netSales);
  const lineCost = find(LINE_COST_ALIASES);
  const cost = lineCost ?? find(UNIT_COST_ALIASES);
  const priceId = find(ALIASES.priceId);
  const sellingPrice = find(ALIASES.sellingPrice);
  const masterPrice = find(ALIASES.masterPrice);
  const unit = find(ALIASES.unit);
  const date = find(ALIASES.date);
  const invoice = find(ALIASES.invoice);
  const productName = find(ALIASES.productName);
  return {
    mapping: {
      productId,
      productName,
      quantity,
      netSales,
      cost,
      priceId,
      sellingPrice,
      masterPrice,
      unit,
      date,
      invoice,
    },
    costBasis: lineCost !== null ? 'line' : 'unit',
  };
}

/** Column index for an Excel column name such as `C` or `AA`. */
function columnIndex(letters: string): number {
  let index = 0;
  for (const ch of letters) index = index * 26 + (ch.charCodeAt(0) - 64);
  return index - 1;
}

/** Calculator mapping keys and the product-sales fields they feed. */
const SELECTION_FIELDS: Record<string, SalesField> = {
  productId: 'productId',
  product: 'productName',
  quantity: 'quantity',
  lineTotal: 'netSales',
  cost: 'cost',
  invoice: 'invoice',
  date: 'date',
};

/**
 * Column mapping for the product sections, following the header names chosen in the calculator so
 * both use the same columns. Columns the calculator does not know (Price ID, Selling/Master Price)
 * are detected by name. A backend duplicate name such as `Tender [C]` points at that column letter.
 */
export function mappingFromSelection(
  header: readonly unknown[],
  selection: Record<string, string>,
): ColumnMapping {
  const mapping = { ...detectMapping(header).mapping };
  const names = header.map(collapse);
  for (const [key, field] of Object.entries(SELECTION_FIELDS)) {
    const name = selection[key];
    if (!name) continue;
    const suffix = /^(.*) \[([A-Z]+)\]$/.exec(name);
    const index = suffix ? columnIndex(suffix[2]) : names.indexOf(collapse(name));
    if (index >= 0 && index < header.length) mapping[field] = index;
  }
  return mapping;
}

export function resolveCostBasis(
  selected: 'auto' | 'unit' | 'line' | undefined,
  suggested: 'unit' | 'line' | 'unknown',
): CostBasis {
  if (selected === 'unit' || selected === 'line') return selected;
  return suggested === 'line' ? 'line' : 'unit';
}

export function normalizeProductId(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' && Number.isInteger(value)) return BigInt(value).toString();
  return String(value).trim();
}

/** POS export footers: a `TOTAL:` row without a Product ID, or the `NOTHING FOLLOWS` marker. */
export function isFooterRow(row: readonly unknown[], mapping: ColumnMapping): boolean {
  if (row.some((c) => typeof c === 'string' && /NOTHING FOLLOWS/i.test(c))) return true;
  const productId = mapping.productId === null ? '' : normalizeProductId(row[mapping.productId]);
  return !productId && row.some((c) => /^total:?$/i.test(String(c ?? '').trim()));
}

/** Widest row length, computed with a loop so very tall sheets cannot overflow the stack. */
export function columnCount(rows: readonly unknown[][]): number {
  let width = 0;
  for (const row of rows) if (row && row.length > width) width = row.length;
  return width;
}

export function sheetSizeError(rows: readonly unknown[][], headerRow: number): string | null {
  const tooMany = 'Reports are limited to 50,000 rows. Split larger reports into batches.';
  if (rows.length >= READ_ROW_CAP) return tooMany;
  let dataRows = 0;
  for (let i = headerRow + 1; i < rows.length; i++) if (!isBlankRow(rows[i])) dataRows++;
  if (dataRows > MAX_DATA_ROWS) return tooMany;
  if (columnCount(rows) > MAX_COLUMNS) return 'Reports are limited to 200 columns.';
  return null;
}

export function missingRequiredFields(mapping: ColumnMapping): SalesField[] {
  return REQUIRED_FIELDS.filter((field) => mapping[field] === null);
}

export function parseQuantity(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const text = value.trim().replace(/,/g, '');
  return /^-?(\d+(\.\d+)?|\.\d+)$/.test(text) ? Number(text) : null;
}

interface Accumulator {
  productId: string;
  productName: string;
  quantity: number;
  netCents: number;
  cogsCents: number;
  missingCost: boolean;
  rowCount: number;
  priceIds: Set<string>;
  regularPriceRows: number;
  supportCents: number;
}

interface ComparisonAccumulator {
  priceId: string;
  productKey: string;
  quantity: number;
  actualCents: number;
  expectedCents: number;
  status: PriceMatchStatus;
  price: number | null;
  source: 'promo' | 'updated' | 'master' | null;
  support: Support | null;
  supportCents: number;
  sellingPrices: Map<number, number>;
}

const PRICE_MATCH_MESSAGES: Record<Exclude<PriceMatchStatus, 'matched'>, (id: string) => string> = {
  'not-found': (id) => `Price ID ${id} not found in price books.`,
  inactive: (id) => `Price book ${id} is inactive; no price-book price applied.`,
  'not-in-book': (id) => `Product is not in price book ${id}.`,
};

function mostFrequent(counts: Map<number, number>): number | null {
  let best: number | null = null;
  let bestCount = 0;
  for (const [value, count] of counts)
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  return best;
}

export function buildSalesReport(
  rows: readonly unknown[][],
  options: SalesReportOptions,
  priceBooks: readonly PriceBook[] = [],
): SalesReportResult {
  const { mapping } = options;
  const groups = new Map<string, Accumulator>();
  const comparisons = new Map<string, ComparisonAccumulator>();
  const issues: SalesIssue[] = [];
  let dataRows = 0;
  let excludedRows = 0;
  const cell = (row: readonly unknown[], field: SalesField) =>
    mapping[field] === null ? null : row[mapping[field]!];

  for (let i = options.headerRow + 1; i < rows.length; i++) {
    const row = rows[i];
    if (isBlankRow(row) || isFooterRow(row, mapping)) continue;
    dataRows++;
    const rowNumber = i + 1;
    const productId = normalizeProductId(cell(row, 'productId'));
    const exclude = (message: string) => {
      issues.push({ row: rowNumber, productId, message, excluded: true });
      excludedRows++;
    };
    if (!productId) {
      exclude(MESSAGES.missingId);
      continue;
    }
    const quantity = parseQuantity(cell(row, 'quantity'));
    const net = parseMoney(cell(row, 'netSales'));
    if ((quantity !== null && quantity < 0) || (net !== null && net < 0)) {
      exclude(MESSAGES.negative);
      continue;
    }
    if (quantity === null || quantity <= 0) {
      exclude(MESSAGES.quantity);
      continue;
    }
    if (net === null) {
      exclude(MESSAGES.netSales);
      continue;
    }

    const warn = (message: string) =>
      issues.push({ row: rowNumber, productId, message, excluded: false });
    let cogsCents: number | null = null;
    const rawCost = cell(row, 'cost');
    if (!isBlank(rawCost)) {
      const cost = parseMoney(rawCost);
      if (cost === null || cost < 0) warn(MESSAGES.invalidCost);
      else
        cogsCents =
          options.costBasis === 'unit' ? Math.round(toCents(cost) * quantity) : toCents(cost);
    }
    if (cogsCents === null) warn(MESSAGES.noCost);

    const key = productId.toUpperCase();
    const name = String(cell(row, 'productName') ?? '').trim();
    const group = groups.get(key) ?? {
      productId,
      productName: '',
      quantity: 0,
      netCents: 0,
      cogsCents: 0,
      missingCost: false,
      rowCount: 0,
      priceIds: new Set<string>(),
      regularPriceRows: 0,
      supportCents: 0,
    };
    if (!group.productName && name) group.productName = name;
    group.quantity = Math.round((group.quantity + quantity) * 1e6) / 1e6;
    group.netCents += toCents(net);
    group.rowCount++;
    if (cogsCents === null) group.missingCost = true;
    else group.cogsCents += cogsCents;
    groups.set(key, group);

    const priceId = normalizePriceId(cell(row, 'priceId'));
    if (!priceId) {
      group.regularPriceRows++;
      continue;
    }
    group.priceIds.add(priceId);
    const compareKey = priceId + '|' + key;
    let line = comparisons.get(compareKey);
    if (!line) {
      const match = matchPriceBook(
        priceBooks,
        priceId,
        productId,
        parseMoney(cell(row, 'masterPrice')),
      );
      line = {
        priceId,
        productKey: key,
        quantity: 0,
        actualCents: 0,
        expectedCents: 0,
        status: match.status,
        price: match.price,
        source: match.source,
        support: match.support,
        supportCents: 0,
        sellingPrices: new Map(),
      };
      comparisons.set(compareKey, line);
    }
    line.quantity = Math.round((line.quantity + quantity) * 1e6) / 1e6;
    line.actualCents += toCents(net);
    if (line.support) {
      const earned = saleSupportCents(line.support, quantity, toCents(net));
      line.supportCents += earned;
      group.supportCents += earned;
    }
    if (line.price !== null) line.expectedCents += Math.round(toCents(line.price) * quantity);
    const selling = parseMoney(cell(row, 'sellingPrice'));
    if (selling !== null)
      line.sellingPrices.set(selling, (line.sellingPrices.get(selling) ?? 0) + 1);
    if (line.status !== 'matched') warn(PRICE_MATCH_MESSAGES[line.status](priceId));
  }

  const lines: ProductSalesLine[] = [...groups.values()].map((g) => {
    const known = !g.missingCost;
    const profitCents = g.netCents - g.cogsCents;
    const afterSupportCents = profitCents + g.supportCents;
    return {
      productId: g.productId,
      productName: g.productName || g.productId,
      quantity: g.quantity,
      netSales: fromCents(g.netCents),
      cogs: known ? fromCents(g.cogsCents) : null,
      grossProfit: known ? fromCents(profitCents) : null,
      grossMarginPercent: known ? percentOf(profitCents, g.netCents) : null,
      support: fromCents(g.supportCents),
      grossProfitAfterSupport: known ? fromCents(afterSupportCents) : null,
      grossMarginAfterSupportPercent: known ? percentOf(afterSupportCents, g.netCents) : null,
      costSource: known ? 'report' : 'missing',
      rowCount: g.rowCount,
      priceIds: [...g.priceIds].sort(),
      regularPriceRows: g.regularPriceRows,
    };
  });
  lines.sort((a, b) => b.netSales - a.netSales || a.productId.localeCompare(b.productId));

  const all = [...groups.values()];
  const costed = all.filter((g) => !g.missingCost);
  const knownNet = costed.reduce((sum, g) => sum + g.netCents, 0);
  const cogs = costed.reduce((sum, g) => sum + g.cogsCents, 0);
  const costedSupport = costed.reduce((sum, g) => sum + g.supportCents, 0);
  const totals: SalesReportTotals = {
    quantity: Math.round(all.reduce((sum, g) => sum + g.quantity, 0) * 1e6) / 1e6,
    netSales: fromCents(all.reduce((sum, g) => sum + g.netCents, 0)),
    knownCostNetSales: fromCents(knownNet),
    cogs: fromCents(cogs),
    grossProfit: fromCents(knownNet - cogs),
    grossMarginPercent: percentOf(knownNet - cogs, knownNet),
    support: fromCents(all.reduce((sum, g) => sum + g.supportCents, 0)),
    grossProfitAfterSupport: fromCents(knownNet - cogs + costedSupport),
    grossMarginAfterSupportPercent: percentOf(knownNet - cogs + costedSupport, knownNet),
    productsWithCost: costed.length,
    productsMissingCost: all.length - costed.length,
  };

  const comparisonLines: PriceComparisonLine[] = [...comparisons.values()]
    .map((c) => {
      const product = groups.get(c.productKey)!;
      const priced = c.status === 'matched' && c.price !== null;
      return {
        priceId: c.priceId,
        productId: product.productId,
        productName: product.productName || product.productId,
        quantity: c.quantity,
        actualNetSales: fromCents(c.actualCents),
        posSellingPrice: mostFrequent(c.sellingPrices),
        price: priced ? c.price : null,
        priceSource: priced ? c.source : null,
        expectedRevenue: priced ? fromCents(c.expectedCents) : null,
        variance: priced ? fromCents(c.actualCents - c.expectedCents) : null,
        status: c.status,
        support: fromCents(c.supportCents),
      };
    })
    .sort((a, b) => a.priceId.localeCompare(b.priceId) || a.productId.localeCompare(b.productId));
  const matched = [...comparisons.values()].filter(
    (c) => c.status === 'matched' && c.price !== null,
  );
  const matchedActual = matched.reduce((sum, c) => sum + c.actualCents, 0);
  const matchedExpected = matched.reduce((sum, c) => sum + c.expectedCents, 0);

  return {
    lines,
    issues,
    totals,
    dataRows,
    includedRows: dataRows - excludedRows,
    excludedRows,
    priceComparison: {
      lines: comparisonLines,
      matchedLines: matched.length,
      actualNetSales: fromCents(matchedActual),
      expectedRevenue: fromCents(matchedExpected),
      variance: fromCents(matchedActual - matchedExpected),
      support: fromCents([...comparisons.values()].reduce((sum, c) => sum + c.supportCents, 0)),
    },
  };
}
