import { buildSampleExportWorkbook, SAMPLE_EXPORT_FILE_NAME } from '../domain/sample-export-file';

/** Saves the demo "Sales Report by Product" export so the full flow can be tried without real data. */
export async function downloadSampleExport(): Promise<void> {
  const data = await buildSampleExportWorkbook();
  const url = URL.createObjectURL(
    new Blob([data], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = SAMPLE_EXPORT_FILE_NAME;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
