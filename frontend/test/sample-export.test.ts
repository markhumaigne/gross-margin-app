import assert from 'node:assert/strict';
import { test } from './harness';
import {
  buildSampleExportWorkbook,
  SAMPLE_EXPORT_FILE_NAME,
} from '../src/app/domain/sample-export-file';
import { readSpreadsheet } from '../src/app/domain/read-spreadsheet';
import { buildSalesReport, detectMapping, findHeaderRow } from '../src/app/domain/sales-report';
import { SEED_PRICE_BOOKS } from '../src/app/mock-data/price-books';

test('demo sample export links to the seed price books', async () => {
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
});
