import { hasProductIdHeader, READ_ROW_CAP } from './sales-report';

/**
 * Reads a CSV or Excel file in the browser into raw cell rows. CSV cells stay text so Product IDs
 * keep leading zeros. Blank rows are kept so row numbers match the source file.
 */
export async function readSpreadsheet(file: File): Promise<unknown[][]> {
  const XLSX = await import('xlsx');
  const workbook = /\.csv$/i.test(file.name)
    ? XLSX.read(await file.text(), { type: 'string', raw: true, sheetRows: READ_ROW_CAP })
    : XLSX.read(new Uint8Array(await file.arrayBuffer()), {
        type: 'array',
        sheetRows: READ_ROW_CAP,
      });
  const sheets = workbook.SheetNames.map((name) =>
    XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name], {
      header: 1,
      raw: true,
      defval: null,
      blankrows: true,
    }),
  );
  return sheets.find((rows) => rows.slice(0, 10).some(hasProductIdHeader)) ?? sheets[0] ?? [];
}
