/**
 * Synthetic October 2026 sales export for demonstrations. Unit costs are mock "historical" costs.
 * Includes one unknown Product ID, one refund (negative quantity) and one row without cost.
 */
export const SAMPLE_SALES_ROWS: readonly (string | number)[][] = [
  ['Product ID', 'Product Name', 'Date', 'Qty', 'Net Sales', 'Unit Cost'],
  ['4800000100011', '24" IPS Monitor FHD 100Hz', '2026-10-01', 2, 11590, 4681],
  ['4800000100028', '27" Curved Gaming Monitor QHD 165Hz', '2026-10-02', 1, 14995, 12210],
  ['4800000200014', 'Wireless Keyboard and Mouse Combo', '2026-10-02', 3, 3885, 820],
  ['4800000300017', '15.6" Laptop Core i5 16GB 512GB SSD', '2026-10-03', 1, 43995, 38750],
  ['4800000200038', 'Wireless Optical Mouse 1600 DPI', '2026-10-04', 5, 2745, 315],
  ['4800000400027', 'USB-C Hub 6-in-1 with HDMI', '2026-10-05', 2, 2390, 720],
  ['4800000100011', '24" IPS Monitor FHD 100Hz', '2026-10-07', 1, 5795, 4681],
  ['4800000500013', 'Portable SSD 1TB USB 3.2', '2026-10-08', 2, 9990, 3980],
  ['4800000400010', 'USB-C Docking Station 8-in-1', '2026-10-09', 1, 4950, 4952],
  ['4800000600016', 'Wireless Headset with Microphone', '2026-10-10', 2, 5590, 1960],
  ['4800009999999', 'Discontinued Item', '2026-10-11', 1, 999, 500],
  ['4800000300024', '14" Ultrabook Ryzen 7 16GB 1TB SSD', '2026-10-12', 1, 56995, 49800],
  ['4800000200045', 'Gaming Mouse RGB 12000 DPI', '2026-10-14', 2, 3590, 1180],
  ['4800000700026', 'Ink Tank Printer 3-in-1', '2026-10-15', 1, 9495, ''],
  ['4800000200014', 'Wireless Keyboard and Mouse Combo', '2026-10-18', -1, -1295, 820],
  ['4800000500020', 'NVMe SSD 1TB PCIe Gen4', '2026-10-20', 3, 13485, 3540],
  ['4800000700019', 'Wi-Fi 6 Dual-Band Router AX1800', '2026-10-22', 1, 3695, 2840],
  ['4800000600030', 'Full HD Webcam with Privacy Cover', '2026-10-25', 2, 3190, 1015],
  ['4800000100035', '21.5" Office Monitor FHD 75Hz', '2026-10-28', 4, 15180, 2879],
  ['4800000700033', 'Printer Ink Bottle Set CMYK', '2026-10-31', 6, 6840, 760],
];

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

export function sampleSalesCsv(): string {
  return SAMPLE_SALES_ROWS.map((row) => row.map(csvCell).join(',')).join('\r\n');
}
