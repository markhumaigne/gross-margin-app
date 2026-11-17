/**
 * POS "Sales Report by Product" exports end with summary rows that are not sales: a `TOTAL:` row
 * (in the invoice column, with no Product ID) and a `… NOTHING FOLLOWS …` marker.
 */
export function isFooterRow(
  cells: readonly string[],
  productIdColumn: number,
  invoiceColumn: number,
): boolean {
  if (cells.some((v) => /NOTHING FOLLOWS/i.test(v))) return true;
  const productId = productIdColumn >= 0 ? (cells[productIdColumn] ?? '').trim() : '';
  if (productId) return false;
  const invoice = invoiceColumn >= 0 ? (cells[invoiceColumn] ?? '').trim() : '';
  return /^total:?$/i.test(invoice);
}
