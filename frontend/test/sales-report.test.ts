import assert from 'node:assert/strict';
import { test } from './harness';
import {
  buildSalesReport,
  columnCount,
  detectMapping,
  findHeaderRow,
  mappingFromSelection,
  MAX_DATA_ROWS,
  missingRequiredFields,
  normalizeProductId,
  resolveCostBasis,
  SalesReportOptions,
  sheetSizeError,
  validateUploadFile,
} from '../src/app/domain/sales-report';
import { readSpreadsheet } from '../src/app/domain/read-spreadsheet';

const opts = (rows: unknown[][], o: Partial<SalesReportOptions> = {}): SalesReportOptions => ({
  headerRow: 0,
  ...detectMapping(rows[0]),
  ...o,
});
const run = (rows: unknown[][], o: Partial<SalesReportOptions> = {}) =>
  buildSalesReport(rows, opts(rows, o));
const H = ['Product ID', 'Product Name', 'Qty', 'Net Total', 'Cost'];
const NONE = {
  priceId: null,
  sellingPrice: null,
  masterPrice: null,
  unit: null,
  date: null,
  invoice: null,
};

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
      mapping: { productId: 0, productName: 1, quantity: 2, netSales: 6, cost: 4, ...NONE },
      costBasis: 'unit',
    },
  );
  assert.deepEqual(detectMapping(['SKU', 'Quantity', 'Amount', 'Total Cost']), {
    mapping: { productId: 0, productName: null, quantity: 1, netSales: 2, cost: 3, ...NONE },
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

test('products come from the file, not a catalog', () => {
  const r = run([
    H,
    ['X-1', 'Real Item', 1, '6,190.00', 4861],
    [' x-1 ', '', 2, 12000, '4861'],
    ['Y-2', '', 2, 2590, 800],
  ]);
  const x = r.lines.find((l) => l.productId === 'X-1')!;
  assert.deepEqual(
    [
      x.productName,
      x.quantity,
      x.netSales,
      x.cogs,
      x.grossProfit,
      x.grossMarginPercent,
      x.rowCount,
    ],
    ['Real Item', 3, 18190, 14583, 3607, 19.83, 2],
  );
  assert.equal(r.lines.find((l) => l.productId === 'Y-2')!.productName, 'Y-2');
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
      [4, 'Negative quantity or sales (refund/return) excluded from totals.', true],
      [5, 'Quantity must be a number greater than zero.', true],
      [6, 'Net sales must be a valid amount.', true],
      [9, 'Cost is invalid; treated as missing.', false],
      [9, 'No historical cost in the report; COGS left blank.', false],
    ],
  );
  assert.deepEqual([r.dataRows, r.includedRows, r.excludedRows], [7, 3, 4]);
  assert.equal(r.lines.find((l) => l.productId === 'A-1')!.grossMarginPercent, null);
});

test('footer rows of the POS export are skipped', () => {
  const rows = [
    ['Product ID', 'TM-INV#', 'Qty', 'Net Total', 'Cost'],
    ['X-1', 'A1', 1, 100, 50],
    [null, 'TOTAL:', 1, 100, null],
    ['1 items  ******** NOTHING FOLLOWS ********', null, null, null, null],
  ];
  const r = run(rows);
  assert.deepEqual([r.dataRows, r.issues.length, r.lines.length], [1, 0, 1]);
});

test('free items and refunds', () => {
  const r = run([H, ['F-1', 'Bag', 1, 0, 8], ['X-1', 'Item', -1, -100, 50]]);
  assert.equal(r.lines[0].grossMarginPercent, null);
  assert.equal(r.lines[0].grossProfit, -8);
  assert.equal(
    r.issues[0].message,
    'Negative quantity or sales (refund/return) excluded from totals.',
  );
});

test('the calculator mapping and cost basis are honoured', () => {
  const header = [
    'Custom SKU',
    'Product Name',
    'Qty',
    'Price\nID',
    'Final Sales Value',
    'Net\nTotal',
    'Line Cost',
  ];
  const m = mappingFromSelection(header, {
    productId: 'Custom SKU',
    lineTotal: 'Final Sales Value',
    cost: 'Line Cost',
  });
  assert.deepEqual([m.productId, m.netSales, m.cost, m.priceId], [0, 4, 6, 3]);
  assert.equal(
    mappingFromSelection(['A', 'Tender', 'Tender'], { productId: 'Tender [C]' }).productId,
    2,
  );
  assert.equal(resolveCostBasis('auto', 'line'), 'line');
  assert.equal(resolveCostBasis('auto', 'unknown'), 'unit');
  assert.equal(resolveCostBasis(undefined, 'unit'), 'unit');
  assert.equal(resolveCostBasis('line', 'unit'), 'line');
});

test('real-layout headers with title rows and line breaks', () => {
  const rows = [
    ['DEMO TRADING'],
    ['Sales Report by Product'],
    ['Sale Date=10/01/2026'],
    [],
    [
      'Product ID',
      'Product Name',
      'Date',
      'TM-INV#',
      'Qty',
      'Net\nTotal',
      'Master Price',
      'Selling Price',
      'Price\nID',
    ],
    [4800000100011, 'Mon', '10/01/2026', 'A1', 1, 5795, 5795, 5795, 'PL000013'],
  ];
  const h = findHeaderRow(rows);
  const m = detectMapping(rows[h]).mapping;
  assert.deepEqual(
    [h, m.netSales, m.masterPrice, m.sellingPrice, m.priceId, m.invoice, m.date],
    [4, 5, 6, 7, 8, 3, 2],
  );
  assert.equal(
    buildSalesReport(rows, { headerRow: h, mapping: m, costBasis: 'unit' }).lines[0].productId,
    '4800000100011',
  );
});

test('readSpreadsheet keeps CSV leading zeros, numeric Excel IDs and reads a named sheet', async () => {
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
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ['Product ID', 'Qty'],
      ['OTHER', 1],
    ]),
    'Second',
  );
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  const rows = await readSpreadsheet(new File([buf], 'a.xlsx'));
  assert.equal(normalizeProductId(rows[1][0]), '4800000100011');
  const named = await readSpreadsheet(new File([buf], 'a.xlsx'), 'Second');
  assert.equal(named[1][0], 'OTHER');
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
