import { fromCents, isBlank, parseMoney, percentOf, toCents } from './money';
import { Product } from './pricing';

export type SalesField = 'productId' | 'productName' | 'quantity' | 'netSales' | 'cost';
/** Column index in the header row for each field, or null when not mapped. */
export type ColumnMapping = Record<SalesField, number | null>;
export type CostBasis = 'unit' | 'line';
export type CostSource = 'report' | 'estimate' | 'mixed' | 'missing';

export const REQUIRED_FIELDS: readonly SalesField[] = ['productId', 'quantity', 'netSales'];
export const FIELD_LABELS: Record<SalesField, string> = {
  productId: 'Product ID',
  productName: 'Product name',
  quantity: 'Quantity',
  netSales: 'Net sales',
  cost: 'Cost',
};

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
  costSource: CostSource;
  rowCount: number;
}

export interface SalesReportTotals {
  quantity: number;
  netSales: number;
  knownCostNetSales: number;
  cogs: number;
  grossProfit: number;
  grossMarginPercent: number | null;
  productsWithCost: number;
  productsMissingCost: number;
}

export interface SalesReportOptions {
  headerRow: number;
  mapping: ColumnMapping;
  costBasis: CostBasis;
  useEstimatedCost: boolean;
}

export interface SalesReportResult {
  lines: ProductSalesLine[];
  issues: SalesIssue[];
  totals: SalesReportTotals;
  dataRows: number;
  includedRows: number;
  excludedRows: number;
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
};
const LINE_COST_ALIASES = ['totalcost', 'linecost', 'extendedcost', 'cogs'];
const UNIT_COST_ALIASES = ['unitcost', 'costperunit', 'cost'];

const MESSAGES = {
  missingId: 'Missing Product ID.',
  unknownId: 'Product ID not found in the mock product catalog.',
  negative: 'Negative quantity or sales (refund/return) excluded from totals.',
  quantity: 'Quantity must be a number greater than zero.',
  netSales: 'Net sales must be a valid amount.',
  invalidCost: 'Cost is invalid; treated as missing.',
  estimated: 'Cost estimated from current mock product cost (not historical).',
  noCost: 'No historical cost in the report; COGS left blank.',
};

const normalizeHeader = (value: unknown) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

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
  const productName = find(ALIASES.productName);
  return {
    mapping: { productId, productName, quantity, netSales, cost },
    costBasis: lineCost !== null ? 'line' : 'unit',
  };
}

export function normalizeProductId(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' && Number.isInteger(value)) return BigInt(value).toString();
  return String(value).trim();
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

function parseQuantity(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const text = value.trim().replace(/,/g, '');
  return /^-?(\d+(\.\d+)?|\.\d+)$/.test(text) ? Number(text) : null;
}

interface Accumulator {
  product: Product;
  quantity: number;
  netCents: number;
  cogsCents: number;
  missingCost: boolean;
  sources: Set<'report' | 'estimate'>;
  rowCount: number;
}

export function buildSalesReport(
  rows: readonly unknown[][],
  options: SalesReportOptions,
  catalog: readonly Product[],
): SalesReportResult {
  const { mapping } = options;
  const byId = new Map(catalog.map((p) => [p.id.toUpperCase(), p]));
  const groups = new Map<string, Accumulator>();
  const issues: SalesIssue[] = [];
  let dataRows = 0;
  let excludedRows = 0;
  const cell = (row: readonly unknown[], field: SalesField) =>
    mapping[field] === null ? null : row[mapping[field]!];

  for (let i = options.headerRow + 1; i < rows.length; i++) {
    const row = rows[i];
    if (isBlankRow(row)) continue;
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
    const product = byId.get(productId.toUpperCase());
    if (!product) {
      exclude(MESSAGES.unknownId);
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
      issues.push({ row: rowNumber, productId: product.id, message, excluded: false });
    let cogsCents: number | null = null;
    let source: 'report' | 'estimate' | null = null;
    const rawCost = cell(row, 'cost');
    if (!isBlank(rawCost)) {
      const cost = parseMoney(rawCost);
      if (cost === null || cost < 0) warn(MESSAGES.invalidCost);
      else {
        cogsCents =
          options.costBasis === 'unit' ? Math.round(toCents(cost) * quantity) : toCents(cost);
        source = 'report';
      }
    }
    if (cogsCents === null) {
      if (options.useEstimatedCost) {
        cogsCents = Math.round(toCents(product.cost) * quantity);
        source = 'estimate';
        warn(MESSAGES.estimated);
      } else warn(MESSAGES.noCost);
    }

    const group = groups.get(product.id) ?? {
      product,
      quantity: 0,
      netCents: 0,
      cogsCents: 0,
      missingCost: false,
      sources: new Set(),
      rowCount: 0,
    };
    group.quantity = Math.round((group.quantity + quantity) * 1e6) / 1e6;
    group.netCents += toCents(net);
    group.rowCount++;
    if (cogsCents === null || source === null) group.missingCost = true;
    else {
      group.cogsCents += cogsCents;
      group.sources.add(source);
    }
    groups.set(product.id, group);
  }

  const lines: ProductSalesLine[] = [...groups.values()].map((g) => {
    const known = !g.missingCost;
    const profitCents = g.netCents - g.cogsCents;
    return {
      productId: g.product.id,
      productName: g.product.name,
      quantity: g.quantity,
      netSales: fromCents(g.netCents),
      cogs: known ? fromCents(g.cogsCents) : null,
      grossProfit: known ? fromCents(profitCents) : null,
      grossMarginPercent: known ? percentOf(profitCents, g.netCents) : null,
      costSource: !known ? 'missing' : g.sources.size > 1 ? 'mixed' : [...g.sources][0],
      rowCount: g.rowCount,
    };
  });
  lines.sort((a, b) => b.netSales - a.netSales || a.productId.localeCompare(b.productId));

  const costed = [...groups.values()].filter((g) => !g.missingCost);
  const knownNet = costed.reduce((sum, g) => sum + g.netCents, 0);
  const cogs = costed.reduce((sum, g) => sum + g.cogsCents, 0);
  const totals: SalesReportTotals = {
    quantity: Math.round([...groups.values()].reduce((sum, g) => sum + g.quantity, 0) * 1e6) / 1e6,
    netSales: fromCents([...groups.values()].reduce((sum, g) => sum + g.netCents, 0)),
    knownCostNetSales: fromCents(knownNet),
    cogs: fromCents(cogs),
    grossProfit: fromCents(knownNet - cogs),
    grossMarginPercent: percentOf(knownNet - cogs, knownNet),
    productsWithCost: costed.length,
    productsMissingCost: groups.size - costed.length,
  };

  return {
    lines,
    issues,
    totals,
    dataRows,
    includedRows: dataRows - excludedRows,
    excludedRows,
  };
}
