import { SAMPLE_EXPORT_ROWS } from '../mock-data/sample-export';

export const SAMPLE_EXPORT_FILE_NAME = 'Sample Sales Report by Product.xlsx';

/** Builds the demo export as an .xlsx file (SheetJS is loaded only when needed). */
export async function buildSampleExportWorkbook(): Promise<ArrayBuffer> {
  const XLSX = await import('xlsx');
  const workbook = XLSX.utils.book_new();
  const rows = SAMPLE_EXPORT_ROWS.map((row) => [...row]);
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), 'Sales Report by Product');
  return XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}
