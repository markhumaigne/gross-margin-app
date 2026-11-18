import { buildSampleExportWorkbook, SAMPLE_EXPORT_FILE_NAME } from '../domain/sample-export-file';
import {
  buildSamplePriceBookWorkbook,
  SAMPLE_PRICE_BOOK_FILE_NAME,
} from '../domain/sample-price-book-file';

function saveWorkbook(data: ArrayBuffer, fileName: string) {
  const url = URL.createObjectURL(
    new Blob([data], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Saves the demo "Sales Report by Product" export so the full flow can be tried without real data. */
export async function downloadSampleExport(): Promise<void> {
  saveWorkbook(await buildSampleExportWorkbook(), SAMPLE_EXPORT_FILE_NAME);
}

/** Saves a demo ZenPOS "Price Book" export (PS000015) for trying the price book import. */
export async function downloadSamplePriceBook(): Promise<void> {
  saveWorkbook(await buildSamplePriceBookWorkbook(), SAMPLE_PRICE_BOOK_FILE_NAME);
}
