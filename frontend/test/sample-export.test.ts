import assert from 'node:assert/strict';
import { expectOk, test } from './harness';
import {
  buildSampleExportWorkbook,
  SAMPLE_EXPORT_FILE_NAME,
} from '../src/app/domain/sample-export-file';
import { readSpreadsheet } from '../src/app/domain/read-spreadsheet';
import { buildSalesReport, detectMapping, findHeaderRow } from '../src/app/domain/sales-report';
import { importFromExport } from '../src/app/domain/sales-import';
import { PRODUCTS } from '../src/app/mock-data/products';
import { SEED_PRICE_BOOKS } from '../src/app/mock-data/price-books';

test('demo sample export links to the seed price books and imports cleanly', async () => {
  const rows = await readSpreadsheet(
    new File([await buildSampleExportWorkbook()], SAMPLE_EXPORT_FILE_NAME),
  );
  const h = findHeaderRow(rows);
  assert.equal(h, 4);
  const r = buildSalesReport(rows, { headerRow: h, ...detectMapping(rows[h]) }, SEED_PRICE_BOOKS);
  assert.deepEqual(
    r.priceComparison.lines.map((l) => [l.priceId, l.productId, l.status, l.variance]),
    [
      ['PL000013', '4800000100011', 'matched', 400],
      ['PL000013', '4800000100035', 'not-in-book', null],
      ['PL000013', '4800000200014', 'matched', -300],
      ['PL000030', '4800000100011', 'matched', 800],
      ['PS000015', '4800000600016', 'not-found', null],
    ],
  );
  assert.deepEqual(
    [
      r.priceComparison.actualNetSales,
      r.priceComparison.expectedRevenue,
      r.priceComparison.variance,
    ],
    [21270, 20370, 900],
  );
  assert.equal(r.dataRows, 11);
  const imported = expectOk(
    importFromExport(
      rows,
      SAMPLE_EXPORT_FILE_NAME,
      '2026-11-17',
      PRODUCTS,
      SEED_PRICE_BOOKS,
      new Date('2026-11-17T02:00:00Z'),
      'Lead',
    ),
  );
  assert.deepEqual(
    [imported.summary.productsAdded, imported.summary.booksCreated, imported.summary.booksExtended],
    [0, ['PS000015'], [{ id: 'PL000013', added: 1 }]],
  );
});
