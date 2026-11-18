import { SAMPLE_PRICE_BOOK_ROWS } from '../mock-data/sample-price-book';

export const SAMPLE_PRICE_BOOK_FILE_NAME = 'Sample ZenPOS Price Book PS000015.xlsx';

/** Builds the demo ZenPOS price book export as an .xlsx file (SheetJS is loaded only when needed). */
export async function buildSamplePriceBookWorkbook(): Promise<ArrayBuffer> {
  const XLSX = await import('xlsx');
  const workbook = XLSX.utils.book_new();
  const rows = SAMPLE_PRICE_BOOK_ROWS.map((row) => [...row]);
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), 'Price Book');
  return XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}
