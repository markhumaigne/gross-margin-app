import assert from 'node:assert/strict';
import { test } from './harness';
import {
  buildSalesReport,
  columnCount,
  MAX_DATA_ROWS,
  sheetSizeError,
  detectMapping,
  findHeaderRow,
  missingRequiredFields,
  normalizeProductId,
  SalesReportOptions,
  validateUploadFile,
} from '../src/app/domain/sales-report';
import { readSpreadsheet } from '../src/app/domain/read-spreadsheet';
import { Product } from '../src/app/domain/pricing';
import { PRODUCTS } from '../src/app/mock-data/products';
import { SAMPLE_SALES_ROWS, sampleSalesCsv } from '../src/app/mock-data/sample-sales';

const catalog: Product[] = [
  {
    id: 'A-1',
    name: 'Alpha',
    unit: 'PCS',
    onHand: 1,
    masterListPrice: 6500,
    sellingPrice: 6190,
    cost: 4900,
  },
  {
    id: 'B-2',
    name: 'Bravo',
    unit: 'PCS',
    onHand: 1,
    masterListPrice: 1500,
    sellingPrice: 1295,
    cost: 820,
  },
];
const opts = (rows: unknown[][], o: Partial<SalesReportOptions> = {}): SalesReportOptions => ({
  headerRow: 0,
  ...detectMapping(rows[0]),
  useEstimatedCost: false,
  ...o,
});
const run = (rows: unknown[][], o: Partial<SalesReportOptions> = {}) =>
  buildSalesReport(rows, opts(rows, o), catalog);
const H = ['SKU', 'Item', 'Qty', 'Net Total', 'Unit Cost'];

test('upload file validation', () => {
  assert.equal(validateUploadFile('r.CSV', 10), null);
  assert.equal(validateUploadFile('notes.txt', 10), 'Upload a .csv, .xlsx or .xls file.');
  assert.equal(validateUploadFile('r.xlsx', 0), 'The selected file is empty.');
  assert.equal(
    validateUploadFile('r.xls', 10 * 1024 * 1024 + 1),
    'Files must be 10 MB or smaller.',
  );
});

test('header row and column detection', () => {
  assert.equal(findHeaderRow([['Sales export'], [], ['Product ID', 'Qty']]), 2);
  assert.deepEqual(
    detectMapping([
      'Product ID',
      'Product Name',
      'Qty',
      'Price',
      'Unit Cost',
      'Line Total',
      'Net Total',
    ]),
    {
      mapping: { productId: 0, productName: 1, quantity: 2, netSales: 6, cost: 4 },
      costBasis: 'unit',
    },
  );
  assert.deepEqual(detectMapping(['SKU', 'Quantity', 'Amount', 'Total Cost']), {
    mapping: { productId: 0, productName: null, quantity: 1, netSales: 2, cost: 3 },
    costBasis: 'line',
  });
  assert.deepEqual(missingRequiredFields(detectMapping(['Item', 'Amount']).mapping), [
    'productId',
    'quantity',
  ]);
});

test('product IDs keep their digits', () => {
  assert.equal(normalizeProductId(' 4800000100011 '), '4800000100011');
  assert.equal(normalizeProductId(4800000100011), '4800000100011');
  assert.equal(normalizeProductId('0012'), '0012');
  assert.equal(normalizeProductId(null), '');
});

test('aggregates quantity, revenue, COGS, gross profit and margin per product', () => {
  const r = run([
    H,
    ['A-1', 'x', 1, '6,190.00', 4861],
    [' a-1 ', 'x', 2, 12000, '4861'],
    ['B-2', 'x', 2, 2590, 800],
  ]);
  const a = r.lines.find((l) => l.productId === 'A-1')!;
  assert.deepEqual(
    [
      a.productName,
      a.quantity,
      a.netSales,
      a.cogs,
      a.grossProfit,
      a.grossMarginPercent,
      a.costSource,
      a.rowCount,
    ],
    ['Alpha', 3, 18190, 14583, 3607, 19.83, 'report', 2],
  );
  assert.deepEqual(
    r.lines.map((l) => l.productId),
    ['A-1', 'B-2'],
  );
  assert.deepEqual(
    [r.totals.netSales, r.totals.cogs, r.totals.grossProfit, r.totals.grossMarginPercent],
    [20780, 16183, 4597, 22.12],
  );
});

test('line-total cost basis uses cost as given', () => {
  const r = run([
    ['SKU', 'Qty', 'Net Total', 'Total Cost'],
    ['B-2', 2, 2590, 1640],
  ]);
  assert.equal(r.lines[0].cogs, 1640);
});

test('partly costed products show no partial COGS', () => {
  const r = run([
    H,
    ['A-1', 'x', 1, 6190, 4861],
    ['A-1', 'x', 1, 6190, ''],
    ['B-2', 'x', 1, 1295, 820],
  ]);
  const a = r.lines.find((l) => l.productId === 'A-1')!;
  assert.deepEqual(
    [a.netSales, a.cogs, a.grossProfit, a.grossMarginPercent, a.costSource],
    [12380, null, null, null, 'missing'],
  );
  assert.deepEqual(
    [r.totals.netSales, r.totals.knownCostNetSales, r.totals.cogs, r.totals.productsMissingCost],
    [13675, 1295, 820, 1],
  );
  assert.deepEqual(
    r.issues.map((i) => [i.row, i.message, i.excluded]),
    [[3, 'No historical cost in the report; COGS left blank.', false]],
  );
});

test('estimated cost is opt-in and labelled', () => {
  const rows = [
    ['SKU', 'Qty', 'Net Total'],
    ['B-2', 2, 2590],
  ];
  assert.equal(run(rows).lines[0].cogs, null);
  const e = run(rows, { useEstimatedCost: true });
  assert.deepEqual(
    [e.lines[0].cogs, e.lines[0].costSource, e.lines[0].grossMarginPercent],
    [1640, 'estimate', 36.68],
  );
  assert.equal(
    e.issues[0].message,
    'Cost estimated from current mock product cost (not historical).',
  );
  const m = run([H, ['B-2', 'x', 1, 1295, 800], ['B-2', 'x', 1, 1295, '']], {
    useEstimatedCost: true,
  });
  assert.deepEqual([m.lines[0].cogs, m.lines[0].costSource], [1620, 'mixed']);
});

test('invalid rows are excluded with reasons and blank rows are skipped', () => {
  const r = run([
    H,
    ['', 'x', 1, 100, 1],
    ['Z-9', 'x', 1, 100, 1],
    ['A-1', 'x', -1, -6190, 4861],
    ['A-1', 'x', 0, 100, 1],
    ['A-1', 'x', 1, 'abc', 1],
    [null, null, null, null, null],
    ['A-1', 'x', 1, 0, 0],
    ['B-2', 'x', 1, 1295, 'n/a'],
  ]);
  assert.deepEqual(
    r.issues.map((i) => [i.row, i.message, i.excluded]),
    [
      [2, 'Missing Product ID.', true],
      [3, 'Product ID not found in the mock product catalog.', true],
      [4, 'Negative quantity or sales (refund/return) excluded from totals.', true],
      [5, 'Quantity must be a number greater than zero.', true],
      [6, 'Net sales must be a valid amount.', true],
      [9, 'Cost is invalid; treated as missing.', false],
      [9, 'No historical cost in the report; COGS left blank.', false],
    ],
  );
  assert.deepEqual([r.dataRows, r.includedRows, r.excludedRows], [7, 2, 5]);
  assert.equal(r.lines.find((l) => l.productId === 'A-1')!.grossMarginPercent, null);
});

test('sample data and CSV round trip', async () => {
  const csv = sampleSalesCsv();
  assert.equal(csv.split('\r\n')[0], 'Product ID,Product Name,Date,Qty,Net Sales,Unit Cost');
  const rows = await readSpreadsheet(new File([csv], 'sample.csv'));
  assert.equal(rows.length - 1, SAMPLE_SALES_ROWS.length - 1);
  const r = buildSalesReport(
    rows,
    { headerRow: 0, ...detectMapping(rows[0]), useEstimatedCost: false },
    PRODUCTS,
  );
  assert.deepEqual(
    r.issues
      .filter((i) => i.excluded)
      .map((i) => i.message)
      .sort(),
    [
      'Negative quantity or sales (refund/return) excluded from totals.',
      'Product ID not found in the mock product catalog.',
    ],
  );
  assert.equal(r.issues.filter((i) => !i.excluded).length, 1);
});

test('readSpreadsheet keeps CSV leading zeros and full numeric Excel IDs', async () => {
  const csvRows = await readSpreadsheet(new File(['Product ID,Qty\r\n0012,1'], 'a.csv'));
  assert.equal(csvRows[1][0], '0012');
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Notes']]), 'Cover');
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ['Product ID', 'Qty'],
      [4800000100011, 2],
    ]),
    'Sales',
  );
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  const rows = await readSpreadsheet(new File([buf], 'a.xlsx'));
  assert.equal(normalizeProductId(rows[1][0]), '4800000100011');
});

test('oversized reports are rejected before processing', async () => {
  const header = 'Product ID,Qty,Net Sales';
  const line = 'B-2,1,100';
  const big = [header, ...Array.from({ length: MAX_DATA_ROWS + 1 }, () => line)].join('\r\n');
  const rows = await readSpreadsheet(new File([big], 'big.csv'));
  assert.ok(rows.length <= MAX_DATA_ROWS + 11, 'reading stops at the row cap');
  assert.equal(
    sheetSizeError(rows, 0),
    'Reports are limited to 50,000 rows. Split larger reports into batches.',
  );
  const small = [header, ...Array.from({ length: 10 }, () => line)].join('\r\n');
  assert.equal(sheetSizeError(await readSpreadsheet(new File([small], 'ok.csv')), 0), null);
  assert.equal(
    sheetSizeError([Array.from({ length: 201 }, (_, i) => 'C' + i)], 0),
    'Reports are limited to 200 columns.',
  );
});

test('columnCount handles very tall sheets without spreading', () => {
  const tall: unknown[][] = Array.from({ length: 130000 }, () => ['x']);
  tall[5] = ['a', 'b', 'c'];
  assert.equal(columnCount(tall), 3);
});
