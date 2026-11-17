# Merged Calculator, Price IDs and Export Import — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One "Bank rate calculator" page that, after calculating a POS "Sales Report by Product"
export, also shows gross margin by product and a Price ID / price book comparison; price books use
PL/PS Price IDs and can be imported (products + price lists) from the same export; the backend skips
the export's footer rows.

**Architecture:** Framework-free domain modules (`frontend/src/app/domain`) do parsing, matching and
import; thin services hold in-memory state; a new `ProductInsightsComponent` renders sections 05/06 on
the calculator page from the uploaded file. One small backend parser change for footer rows.

**Tech Stack:** Angular 21 signals, SheetJS `xlsx` (lazy), ts-node + node:assert (frontend and
backend runners), Playwright.

**Spec:** `docs/superpowers/specs/2026-11-17-merged-sales-report-design.md` (+ Price ID rules in
`docs/superpowers/specs/2026-11-17-price-book-sales-link-design.md`, base spec
`docs/superpowers/specs/2026-11-17-price-book-design.md`). Supersedes
`docs/superpowers/plans/2026-11-17-price-id-sales-link.md`.

## Global Constraints

- Branch `test`; commit per task. In-memory only; no DB/API additions. Only backend change: footer skip.
- Single sidebar item **Bank rate calculator** at `/calculator`; `/sales-report` redirects there.
  Permission `sales-report` is removed; `calculator` = Admin + Accounting Head (both land on
  `/calculator`). Product Team: Price books only.
- The calculator's existing behaviour, 17 columns and 4-sheet Excel export stay unchanged; existing
  `e2e/workflow.spec.ts` must pass **without edits**. New tables use `<th scope="row">` for the
  Product ID cell so page-wide `getByRole('cell')` locators in existing tests stay unique.
- Price ID `^(PL|PS)\d{6}$`, upper-case, unique case-insensitively, immutable; auto IDs = highest
  `PL` + 1 (6 digits). Seeds: `PL000013` Standard Retail 2026, `PL000030` November Monitor Sale,
  `PL000034` December Holiday Promo (inactive); next auto `PL000035`.
- Matching: blank Price ID = regular price (not compared); price-book price = promo ?? updated ??
  master; expected = Σ round(priceCents × qty); variance = actual net − expected; dates ignored.
- Footer rows: a row containing `NOTHING FOLLOWS` (any cell, case-insensitive) or whose invoice cell
  is `TOTAL:`/`TOTAL` with a blank Product ID. Skipped by backend and all browser parsers.
- Never display customer columns (Cust Name, Customer ID, Memo, Lot/Serial, Payment, Tender, Ref)
  in the new sections.
- Money in centavos, percentages half away from zero to 2 dp, 390 px no horizontal scroll, reuse
  existing CSS classes, prettier on changed code files (README excluded).

## Review Focus

1. Real exports with 4 title rows, `Price\nID`/`Net\nTotal` headers and numeric Product IDs — header
   and columns found, IDs exact. Pinned in Task 3 and Task 9.
2. Calculator column overrides (user maps a custom net-total column) — the product sections use the
   same mapping as the calculation. Pinned in Task 3.
3. Importing an export whose Price IDs already exist (seed `PL000013`) — existing entries untouched,
   only missing products added; no duplicate products. Pinned in Task 5.
4. Price book edited while the calculator page is kept alive — sections 05/06 update without
   recalculating. Pinned in Task 9.
5. Free items (price 0, cost > 0) and refunds — net 0 gives blank margin %, refunds excluded with a
   reason. Pinned in Task 3.

---

### Task 1: One calculator page — remove the separate Sales Report page

**Files:**
- Modify: `frontend/src/app/domain/roles.ts` (`Permission = 'calculator' | 'price-books' | 'users'`;
  accounting-head home `/calculator`; `pathPermission` maps `sales-report` → `calculator`),
  `frontend/src/app/app.routes.ts` (drop the sales-report route; child
  `{ path: 'sales-report', redirectTo: 'calculator', pathMatch: 'full' }`),
  `frontend/src/app/layout/shell.component.ts` (drop the nav item)
- Delete: `frontend/src/app/pages/sales-report/` (component + template), `e2e/sales-report.spec.ts`
- Modify tests: `frontend/test/core.test.ts`, `e2e/access-control.spec.ts`, `e2e/users.spec.ts`

**Interfaces:** Produces the roles above; `homePath('accounting-head') === '/calculator'`.

- [ ] **Step 1: Update tests first.** core: admin permissions `['calculator','price-books','users']`,
  accounting `['calculator']`, `homePath('accounting-head') === '/calculator'`,
  `pathPermission('/sales-report?x=1') === 'calculator'`. access-control: nav lists become
  `['Bank rate calculator','Price books','User accounts']` (admin) and `['Bank rate calculator']`
  (accounting); accounting lands on `/calculator`; Product Team forbidden list
  `['/calculator','/users']`; `/sales-report` as accounting ends at `/calculator`; returnUrl test uses
  `%2Fcalculator`; the keep-state test checks only the calculator rate. users.spec: after transfer,
  productteam lands on `/calculator`.
- [ ] **Step 2: Run** `npm run test -w frontend` and `npx playwright test e2e/access-control.spec.ts e2e/users.spec.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same commands plus `npx playwright test e2e/workflow.spec.ts` — Expected: PASS.
- [ ] **Step 5: Commit** `feat: merge sales report into the bank rate calculator page`

---

### Task 2: POS-style Price IDs for price books

As Task 1 of `docs/superpowers/plans/2026-11-17-price-id-sales-link.md` (its Interfaces, test code and
steps apply verbatim): `PRICE_ID_PATTERN`, `normalizePriceId`, `PriceBookDraft.autoId/id`,
`PriceBookErrors.id`, PL auto IDs, seed renumbering, existing test expectations renamed.
Also rename IDs in `e2e/price-books.spec.ts` (`PB-0001`→`PL000013`, `PB-0002`→`PL000030`,
`PB-0003`→`PL000034`, created/duplicated `PB-0004`→`PL000035`).

- [ ] **Step 1–5** as in that plan; Step 4 also runs `npx playwright test e2e/price-books.spec.ts`
  (editor still lacks the manual-ID field, so only the renamed existing tests run here).
  Commit `feat: use POS-style Price IDs for price books`.

---

### Task 3: Product sales from the uploaded export (no catalog)

**Files:**
- Modify: `frontend/src/app/domain/sales-report.ts`, `frontend/src/app/domain/read-spreadsheet.ts`
- Delete: `frontend/src/app/mock-data/sample-sales.ts`
- Modify: `frontend/test/sales-report.test.ts` (rewrite catalog/estimate cases as below)

**Interfaces:**
- `SalesField` = `'productId' | 'productName' | 'quantity' | 'netSales' | 'cost' | 'priceId' | 'sellingPrice' | 'masterPrice' | 'unit' | 'date' | 'invoice'`.
  New aliases (normalised): priceId `priceid, pricebookid, pricelistid, pricelist, pricebook`;
  sellingPrice `sellingprice`; masterPrice `masterprice`; unit `unit, uom`; date `date, saledate, salesdate`;
  invoice `tminv, invoice, invoiceno, invoicenumber, or, receipt`. Existing aliases unchanged
  (productName no longer includes `item`-only collisions with `itemcode`).
- `isFooterRow(row: readonly unknown[], mapping: ColumnMapping): boolean` (rule in Global Constraints).
- `mappingFromSelection(header: readonly unknown[], selection: Record<string, string>): ColumnMapping`
  — starts from `detectMapping(header).mapping`, then applies the calculator's chosen header names for
  `productId, product→productName, quantity, lineTotal→netSales, cost, invoice, date`. Header text is
  matched after collapsing whitespace; a name ending ` [COL]` (backend duplicate suffix) maps to that
  column letter.
- `resolveCostBasis(selected: 'auto' | 'unit' | 'line' | undefined, suggested: 'unit' | 'line' | 'unknown'): CostBasis`
  (explicit wins; auto → `line` only when suggested is `line`).
- `SalesReportOptions = { headerRow: number; mapping: ColumnMapping; costBasis: CostBasis }`
  (`useEstimatedCost` removed).
- `buildSalesReport(rows, options, priceBooks: readonly PriceBook[] = [])` — **no catalog**:
  product name = first non-blank name for that Product ID (else the ID); products are grouped by
  Product ID as written (trimmed, case-insensitive key, first spelling kept); unknown-ID rule and
  estimate messages removed; footer rows skipped (not counted in `dataRows`).
- `readSpreadsheet(file: File, sheetName?: string)` — uses that sheet when given.

- [ ] **Step 1: Write the failing tests** (keep the existing upload/header/ID/size tests; replace the
  catalog-based ones):

```ts
const H = ['Product ID', 'Product Name', 'Qty', 'Net Total', 'Cost'];
const opts = (rows: unknown[][], o: Partial<SalesReportOptions> = {}): SalesReportOptions =>
  ({ headerRow: 0, ...detectMapping(rows[0]), ...o });
const run = (rows: unknown[][], o: Partial<SalesReportOptions> = {}) => buildSalesReport(rows, opts(rows, o));
test('products come from the file, not a catalog', () => {
  const r = run([H, ['X-1', 'Real Item', 1, '6,190.00', 4861], [' x-1 ', '', 2, 12000, '4861'], ['Y-2', '', 2, 2590, 800]]);
  const x = r.lines.find((l) => l.productId === 'X-1')!;
  assert.deepEqual([x.productName, x.quantity, x.netSales, x.cogs, x.grossProfit, x.grossMarginPercent, x.rowCount], ['Real Item', 3, 18190, 14583, 3607, 19.83, 2]);
  assert.equal(r.lines.find((l) => l.productId === 'Y-2')!.productName, 'Y-2');
});
test('footer rows of the POS export are skipped', () => {
  const rows = [['Product ID', 'TM-INV#', 'Qty', 'Net Total', 'Cost'], ['X-1', 'A1', 1, 100, 50],
    [null, 'TOTAL:', 1, 100, null], ['1 items  ******** NOTHING FOLLOWS ********', null, null, null, null]];
  const r = run(rows);
  assert.deepEqual([r.dataRows, r.issues.length, r.lines.length], [1, 0, 1]);
});
test('free items and refunds', () => {
  const r = run([H, ['F-1', 'Bag', 1, 0, 8], ['X-1', 'Item', -1, -100, 50]]);
  assert.equal(r.lines[0].grossMarginPercent, null);
  assert.equal(r.lines[0].grossProfit, -8);
  assert.equal(r.issues[0].message, 'Negative quantity or sales (refund/return) excluded from totals.');
});
test('the calculator mapping and cost basis are honoured', () => {
  const header = ['Custom SKU', 'Product Name', 'Qty', 'Price\nID', 'Final Sales Value', 'Net\nTotal', 'Line Cost'];
  const m = mappingFromSelection(header, { productId: 'Custom SKU', lineTotal: 'Final Sales Value', cost: 'Line Cost' });
  assert.deepEqual([m.productId, m.netSales, m.cost, m.priceId], [0, 4, 6, 3]);
  assert.equal(mappingFromSelection(['A', 'Tender', 'Tender'], { productId: 'Tender [C]' }).productId, 2);
  assert.equal(resolveCostBasis('auto', 'line'), 'line');
  assert.equal(resolveCostBasis('auto', 'unknown'), 'unit');
  assert.equal(resolveCostBasis('line', 'unit'), 'line');
});
test('real-layout headers with title rows and line breaks', () => {
  const rows = [['DEMO TRADING'], ['Sales Report by Product'], ['Sale Date=10/01/2026'], [],
    ['Product ID', 'Product Name', 'Date', 'TM-INV#', 'Qty', 'Net\nTotal', 'Master Price', 'Selling Price', 'Price\nID'],
    [4800000100011, 'Mon', '10/01/2026', 'A1', 1, 5795, 5795, 5795, 'PL000013']];
  const h = findHeaderRow(rows);
  const m = detectMapping(rows[h]).mapping;
  assert.deepEqual([h, m.netSales, m.masterPrice, m.sellingPrice, m.priceId, m.invoice, m.date], [4, 5, 6, 7, 8, 3, 2]);
  assert.equal(buildSalesReport(rows, { headerRow: h, mapping: m, costBasis: 'unit' }).lines[0].productId, '4800000100011');
});
```

- [ ] **Step 2: Run `npm run test -w frontend`** — Expected: FAIL.
- [ ] **Step 3: Implement; delete `sample-sales.ts` and its test usages.**
- [ ] **Step 4: Run `npm run test -w frontend` and `npm run build -w frontend`** — Expected: PASS
  (the old sales-report page was deleted in Task 1, so nothing else consumes the changed API).
- [ ] **Step 5: Commit** `feat: build product sales from the uploaded export`

---

### Task 4: Price ID matching and the comparison

As Task 2 of `2026-11-17-price-id-sales-link.md` (create `domain/price-match.ts`; add `priceIds`,
`regularPriceRows`, `priceComparison` to the result; warning messages), adapted:
- No catalog argument (`buildSalesReport(rows, options, priceBooks)`); its tests drop the `catalog`
  argument, use product names from the rows, and keep their numbers.
- `PriceComparisonLine` adds `posSellingPrice: number | null` = most frequent `sellingPrice` among the
  line's rows (null when the column is absent).
- Drop that plan's sample-data test; Task 6 adds it for the new sample.

```ts
test('comparison shows the POS selling price', () => {
  const head = ['SKU', 'Price ID', 'Qty', 'Net Total', 'Cost', 'Selling Price'];
  const rows = [head, ['A-1', 'PL000013', 1, 5795, 4861, 5795], ['A-1', 'PL000013', 1, 5795, 4861, 5795], ['A-1', 'PL000013', 1, 5000, 4861, 5000]];
  const r = buildSalesReport(rows, { headerRow: 0, ...detectMapping(head) }, books);
  assert.equal(r.priceComparison.lines[0].posSellingPrice, 5795);
});
```
- [ ] Steps 1–5 as in that plan. Commit `feat: match sales rows to price books by Price ID`.

---

### Task 5: Import products and price lists from an export

**Files:**
- Create: `frontend/src/app/domain/sales-import.ts`, `frontend/test/sales-import.test.ts` (+ `run.ts`)
- Modify: `frontend/src/app/domain/pricing.ts` (`Product` gains `source?: 'demo' | 'import'`;
  `onHand: number | null`; `cost: number | null`; `marginPercent` callers treat null cost as `—`)
- Modify: `frontend/src/app/domain/dates.ts` (`parseReportDate(value: unknown): string | null` —
  `YYYY-MM-DD`, `MM/DD/YYYY`, Excel serial in the 1900 system → `YYYY-MM-DD`)

**Interfaces:**
- `interface ImportSummary { fileName: string; productsAdded: number; productsAlreadyInCatalog: number; productsWithoutPrice: number; booksCreated: string[]; booksExtended: { id: string; added: number }[] }`
- `importFromExport(rows: readonly unknown[][], fileName: string, today: string, catalog: readonly Product[], books: readonly PriceBook[], now: Date, actor: string): Result<{ products: Product[]; books: PriceBook[]; summary: ImportSummary }>`
  - Header via `findHeaderRow`/`detectMapping`; requires productId and (masterPrice or sellingPrice),
    else `fail('This file has no Product ID and price columns.')`. Footer rows skipped.
  - Product per ID (first spelling): name, unit (`PCS` default), master = first positive Master Price
    (else first positive Selling Price), selling = Selling Price of a blank-Price-ID row if any else
    master, cost = first valid Cost ≥ 0 else null, onHand null, `source: 'import'`. No positive price
    → counted in `productsWithoutPrice`, not added. IDs already in `catalog` are not changed.
  - Report date = first `parseReportDate` of the Date column, else `today`.
  - Price lists from rows with Price ID, qty > 0 and Selling Price > 0: per ID × product the most
    frequent Selling Price (ties → first). `PS` and price ≤ product master → `promoPrice`; else
    `updatedPrice`. New ID → active book `Imported <ID>`, description `Imported from <fileName> (POS selling prices).`,
    effective = report date, PS expiration = report date (else null); entry start = report date,
    end = PS ? report date : null. Existing ID → only products missing from it are added with start =
    max(report date, book effective), end = book expiration (PS without expiration: start). Products
    referenced by price lists are always in the resulting catalog (imported or existing).
- Messages: summary notice text built by UI (Task 7).

- [ ] **Step 1: Write the failing tests**

```ts
const rows = [['Title'], [], ['Product ID', 'Product Name', 'Date', 'Qty', 'Unit', 'Cost', 'Master Price', 'Selling Price', 'Price\nID'],
  ['R-1', 'Real SSD', '11/16/2026', 1, 'PCS', 11501, 13995, 15195, 'PL000034'],
  ['R-1', 'Real SSD', '11/16/2026', 1, 'PCS', 11501, 13995, 15195, 'PL000034'],
  ['R-1', 'Real SSD', '11/16/2026', 1, 'PCS', 11501, 13995, 13995, ''],
  ['R-2', 'Real Pad', '11/16/2026', 1, 'PCS', 900, 1500, 1200, 'PS000010'],
  ['R-3', 'Free Bag', '11/16/2026', 1, 'PCS', 8, 0, 0, ''],
  ['4800000100035', 'Office Mon', '11/16/2026', 2, 'PCS', 2879, 3950, 3795, 'PL000013'],
  [null, null, null, 4, null, null, null, null, null],
  ['4 items  ******** NOTHING FOLLOWS ********']];
const now = new Date('2026-11-17T02:00:00Z');
test('imports products from the export without touching the catalog', () => {
  const { products, summary } = expectOk(importFromExport(rows, 'x.xlsx', '2026-11-17', PRODUCTS, SEED_PRICE_BOOKS, now, 'Lead'));
  const ssd = products.find((p) => p.id === 'R-1')!;
  assert.deepEqual([ssd.name, ssd.masterListPrice, ssd.sellingPrice, ssd.cost, ssd.onHand, ssd.source], ['Real SSD', 13995, 13995, 11501, null, 'import']);
  assert.deepEqual([summary.productsAdded, summary.productsAlreadyInCatalog, summary.productsWithoutPrice], [2, 1, 1]);
  assert.equal(products.find((p) => p.id === '4800000100035')!.masterListPrice, 3950);
});
test('imports price lists: new PL/PS books and extends existing ones', () => {
  const { books, summary } = expectOk(importFromExport(rows, 'x.xlsx', '2026-11-17', PRODUCTS, SEED_PRICE_BOOKS, now, 'Lead'));
  const ps = books.find((b) => b.id === 'PS000010')!;
  assert.deepEqual([ps.name, ps.active, ps.effectiveDate, ps.expirationDate], ['Imported PS000010', true, '2026-11-16', '2026-11-16']);
  assert.deepEqual(ps.entries.map((e) => [e.productId, e.promoPrice, e.updatedPrice, e.effectiveEnd]), [['R-2', 1200, null, '2026-11-16']]);
  const pl34 = books.find((b) => b.id === 'PL000034')!;
  assert.equal(pl34.name, 'December Holiday Promo');
  assert.deepEqual(pl34.entries.find((e) => e.productId === 'R-1'), { productId: 'R-1', updatedPrice: 15195, promoPrice: null, effectiveStart: '2026-12-01', effectiveEnd: '2026-12-31', memo: '' });
  assert.equal(pl34.entries.length, SEED_PRICE_BOOKS[2].entries.length + 1);
  const pl13 = books.find((b) => b.id === 'PL000013')!;
  assert.deepEqual(pl13.entries.at(-1)!.updatedPrice, 3795);
  assert.deepEqual(summary.booksCreated, ['PS000010']);
  assert.deepEqual(summary.booksExtended, [{ id: 'PL000013', added: 1 }, { id: 'PL000034', added: 1 }]);
  const all = expectOk(importFromExport(rows, 'x.xlsx', '2026-11-17', PRODUCTS, SEED_PRICE_BOOKS, now, 'Lead'));
  for (const b of all.books)
    assert.equal(hasErrors(validatePriceBook(draftFromBook(b), all.books, all.products, b.id)), false, b.id);
});
test('re-importing adds nothing twice', () => {
  const first = expectOk(importFromExport(rows, 'x.xlsx', '2026-11-17', PRODUCTS, SEED_PRICE_BOOKS, now, 'Lead'));
  const again = expectOk(importFromExport(rows, 'x.xlsx', '2026-11-17', first.products, first.books, now, 'Lead'));
  assert.deepEqual([again.summary.productsAdded, again.summary.booksCreated, again.summary.booksExtended], [0, [], []]);
});
test('files without the needed columns are rejected; report dates parse', () => {
  assert.equal(expectFail(importFromExport([['Name', 'Qty'], ['x', 1]], 'x.csv', '2026-11-17', PRODUCTS, SEED_PRICE_BOOKS, now, 'L')), 'This file has no Product ID and price columns.');
  assert.deepEqual(['11/16/2026', 46296, '2026-10-01', 'nope'].map(parseReportDate), ['2026-11-16', '2026-10-01', '2026-10-01', null]);
});
```
  (`products` returned = catalog + newly imported, in that order; `books` = all books.)

- [ ] **Step 2: Run** `npm run test -w frontend` — Expected: FAIL.
- [ ] **Step 3: Implement** `sales-import.ts`, `parseReportDate`, Product type changes (fix compile
  errors in picker/editor/catalog uses of `cost`/`onHand`: show `—` for null).
- [ ] **Step 4: Run** `npm run test -w frontend` and `npm run build -w frontend` — Expected: PASS.
- [ ] **Step 5: Commit** `feat: import products and price lists from a sales export`

---

### Task 6: Demo sample export in the POS layout

**Files:**
- Create: `frontend/src/app/mock-data/sample-export.ts`, `frontend/src/app/domain/sample-export-file.ts`
- Modify: `frontend/test/sales-report.test.ts`

**Interfaces:**
- `SAMPLE_EXPORT_ROWS: readonly (string | number | null)[][]` — rows 1–4 title (`DEMO TRADING`,
  `Sales Report by Product`, `Sale Date=10/01/2026~10/01/2026, Posted Sales`, empty), header
  `['Product ID','Product Name','Date','TM-INV#','Qty','Unit','Price','Cost','Discount','Net Total','Master Price','Selling Price','Price ID','Payment','Branch']`,
  then data rows (Date `10/01/2026`, Unit `PCS`, Discount 0, Branch `DEMO BRANCH`):

| Product ID | Name | Inv | Qty | Price | Cost | Net | Master | Selling | Price ID | Payment |
|---|---|---|---|---|---|---|---|---|---|---|
| 4800000100011 | 24" IPS Monitor FHD 100Hz | DEMO-0001 | 2 | 5795 | 4681 | 11590 | 5795 | 5795 | PL000013 | BDO STRAIGHT |
| 4800000100028 | 27" Curved Gaming Monitor QHD 165Hz | DEMO-0002 | 1 | 14995 | 12210 | 14995 | 15995 | 14995 | | Cash |
| 4800000200014 | Wireless Keyboard and Mouse Combo | DEMO-0003 | 3 | 1295 | 820 | 3885 | 1495 | 1295 | PL000013 | BDO 3 MOS |
| 4800000300017 | 15.6" Laptop Core i5 16GB 512GB SSD | DEMO-0004 | 1 | 43995 | 38750 | 43995 | 45995 | 43995 | | BDO STRAIGHT |
| 4800000100011 | 24" IPS Monitor FHD 100Hz | DEMO-0005 | 1 | 5795 | 4681 | 5795 | 5795 | 5795 | PL000030 | PAYMAYA DEBIT |
| 4800000600016 | Wireless Headset with Microphone | DEMO-0006 | 2 | 2795 | 1960 | 5590 | 2995 | 2795 | PS000015 | Cash |
| 4800000100035 | 21.5" Office Monitor FHD 75Hz | DEMO-0007 | 4 | 3795 | 2879 | 15180 | 3950 | 3795 | PL000013 | BDO STRAIGHT |
| 4800000200014 | Wireless Keyboard and Mouse Combo | DEMO-0008 | -1 | 1295 | 820 | -1295 | 1495 | 1295 | PL000013 | Cash |
| 4800000700026 | Ink Tank Printer 3-in-1 | DEMO-0009 | 1 | 9495 | *(blank)* | 9495 | 9995 | 9495 | | BDO 3 MOS |
| 4800000400010 | USB-C Docking Station 8-in-1 | DEMO-0010 | 1 | 4950 | 4952 | 4950 | 4950 | 4950 | | Cash |
| 4800000200038 | Wireless Optical Mouse 1600 DPI | DEMO-0010 | 1 | 0 | 315 | 0 | 595 | 0 | | Cash |

  then footer `[null,null,null,'TOTAL:',16,null,null,null,0,114180]` and
  `['11 items  ******** NOTHING FOLLOWS ********']`.
- `buildSampleExportWorkbook(): Promise<ArrayBuffer>` (`xlsx`, one sheet `Sales Report by Product`);
  `SAMPLE_EXPORT_FILE_NAME = 'Sample Sales Report by Product.xlsx'`.

- [ ] **Step 1: Failing test** — read the generated workbook with `readSpreadsheet`, build with
  `findHeaderRow`/`detectMapping` + `SEED_PRICE_BOOKS`; assert comparison lines
  `[['PL000013','4800000100011','matched',400],['PL000013','4800000100035','not-in-book',null],['PL000013','4800000200014','matched',-300],['PL000030','4800000100011','matched',800],['PS000015','4800000600016','not-found',null]]`,
  totals `[21270, 20370, 900]`, `dataRows` 11, and import summary `booksCreated ['PS000015']`,
  `booksExtended [{ id: 'PL000013', added: 1 }]` (booksExtended sorted by ID).
- [ ] **Step 2–4:** run (FAIL), implement, run (PASS).
- [ ] **Step 5: Commit** `feat: add demo Sales Report by Product sample`

---

### Task 7: Backend skips export footer rows

**Files:**
- Create: `backend/src/excel/footer.ts` — `isFooterRow(cells: readonly string[], productIdColumn: number, invoiceColumn: number): boolean`
- Modify: `backend/src/excel/excel.service.ts` (skip footers in `describe` record counting/preview and in `parse`)
- Modify: `backend/test/run.ts`

- [ ] **Step 1: Failing test**

```ts
test('POS export footer rows are not parsed as sales', () => {
  const file = upload(workbook({ 'Sales Report by Product': [['DEMO'], ['Sales Report by Product'], ['Sale Date=10/01/2026'], [],
    ['Product ID', 'Product Name', 'Date', 'TM-INV#', 'Qty', 'Price', 'Cost', 'Discount', 'Net Total', 'Payment', 'Branch'],
    ['000123', 'Laptop', '10/01/2026', '0001', 1, 30000, 25000, 0, 30000, 'BDO STRAIGHT', 'ASUS'],
    [null, null, null, 'TOTAL:', 1, null, null, 0, 30000, null, null],
    ['1 items  ******** NOTHING FOLLOWS ********']] }));
  const s = excel.preview(file).sheets[0];
  assert.equal(s.headerRow, 5);
  assert.equal(s.recordCount, 1);
  const sales = excel.parse(file, { sheet: s.name, headerRow: s.headerRow, mapping: s.suggestedMapping });
  assert.equal(sales.length, 1);
  assert.equal(sales[0].invoice, '0001');
});
```
- [ ] **Step 2:** `npm run test -w backend` — Expected: FAIL (records 3 / sales 3).
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm run test -w backend` — Expected: all pass (77/77).
- [ ] **Step 5: Commit** `fix: skip POS export footer rows in the calculator`

---

### Task 8: Price book UI — manual Price ID and export import

**Files:**
- Modify: `price-book-editor.component.ts/.html` (Auto ID / Price ID field — as Task 3 of the
  superseded plan, test code verbatim), `product-picker.component.ts/.html` (`Imported` tag; `—` for
  null cost/on hand/margin), `price-book-list.component.ts/.html` (header buttons
  `Import from sales export` + `Download sample export`; hidden file input labelled
  `Import products and price lists from a sales export`, `.xlsx,.xls,.csv`)
- Modify: `core/product-catalog.service.ts` (writable store; `replaceAll(products)`),
  `core/price-book.service.ts` (`importFromExport(actor, file): Promise<Result<ImportSummary>>` — permission
  check, `validateUploadFile`, `readSpreadsheet`, `sheetSizeError`, domain import, then update both stores)
- Create: shared helper `frontend/src/app/core/sample-download.ts` (`downloadSampleExport(): Promise<void>`)
- Modify: `e2e/price-books.spec.ts`

**Interfaces:** Success notice (role status):
`Imported <productsAdded> products and <created + extended> price lists from <fileName> (<created> new, <extended> extended).`
Errors in the page alert.

- [ ] **Step 1: Failing e2e** (manual-ID test from the superseded plan, plus):

```ts
test('Product Team imports products and price lists from a sales export', async ({ page }) => {
  await signIn(page, ...ACCOUNTS.product);
  const XLSX = await import('xlsx');
  const { SAMPLE_EXPORT_ROWS } = await import('../frontend/src/app/mock-data/sample-export');
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([...SAMPLE_EXPORT_ROWS.map((r) => [...r]),
    ['9900000000001', 'Real Import Item', '10/01/2026', 'X1', 1, 'PCS', 999, 500, 0, 999, 1099, 999, '', 'Cash', 'B']]), 'Sales Report by Product');
  await page.getByLabel('Import products and price lists from a sales export').setInputFiles({
    name: 'export.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer });
  await expect(page.getByRole('status')).toHaveText('Imported 1 products and 2 price lists from export.xlsx (1 new, 1 extended).');
  await expect(page.getByRole('row').filter({ hasText: 'PS000015' })).toContainText('Imported PS000015');
  await page.getByRole('link', { name: 'Edit PL000013' }).click();
  await page.getByRole('button', { name: 'Add products' }).click();
  await page.getByRole('dialog').getByLabel('Search products').fill('Real Import');
  await expect(page.getByRole('dialog').getByRole('row').filter({ hasText: '9900000000001' })).toContainText('Imported');
});
```
- [ ] **Step 2–4:** run (FAIL), implement, `npx playwright test e2e/price-books.spec.ts` (PASS).
- [ ] **Step 5: Commit** `feat: manual Price IDs and sales export import in price books`

---

### Task 9: Calculator page — product sections 05/06

**Files:**
- Create: `frontend/src/app/components/product-insights/product-insights.component.ts/.html`
- Modify: `components/dashboard/dashboard.component.ts/.html` (after a successful calculation keep
  `analysedUpload = signal<ReportUpload | undefined>`; clear it in `invalidate()`; render
  `<app-product-insights [upload]="…">` after the results section; add the
  `Download sample Sales Report by Product` button to the upload info line; subtitle text),
  `frontend/src/styles.scss`
- Create: `e2e/calculator-insights.spec.ts`

**Interfaces:**
- `ProductInsightsComponent` input `upload: ReportUpload`; reads the file once per upload
  (`readSpreadsheet(file, selection.sheet)`), `mappingFromSelection(rows[headerRow-1], selection.mapping)`,
  `resolveCostBasis(selection.costBasis, preview.suggestedCostBasis)`; `report` computed over
  `PriceBookService.books()`.
- Section `05 Gross margin by product` (badge `BEFORE BANK CHARGES`): metrics Net sales revenue, COGS,
  Gross profit, Gross margin; table `Gross margin by product` — Product ID (`th scope=row`), Product
  name, Qty sold, Net sales revenue, COGS, Gross profit, Gross margin %, Price ID (`Regular price`
  rules from the link design); `tfoot` Total; review table `Product rows needing review` capped at 200
  with the existing summary line.
- Section `06 Price book comparison` (only when lines exist; else the info line
  `No sales in this report carry a Price ID; all were treated as regular price.`): metrics
  `Price-book sales (actual)`, `Expected at price-book prices`, `Variance` (`<n> matched lines`);
  table `Price book comparison` — Price ID, Product ID (`th scope=row`), Product name, Qty, Actual net
  sales, POS selling price, Price-book price (+ caption `promo`/`updated`/`master`), Expected revenue,
  Variance, Status; footnote from the link design.
- Demonstration label: `Product sections are calculated in this browser from the uploaded file; price books are demo data.`

- [ ] **Step 1: Failing e2e** (`calculator-insights.spec.ts`; helper `sampleFile()` builds the sample
  workbook as in Task 8; `uploadAndCalculate(page)` sets `Upload Sales Report`, waits for the
  calculate button, clicks `Calculate Bank Rate Deductions`):

```ts
test('one upload gives bank deductions, gross margin by product and price book comparison', async ({ page }) => {
  await signIn(page, ...ACCOUNTS.accounting);
  await expect(page).toHaveURL(/\/calculator$/);
  await uploadAndCalculate(page);
  await expect(page.getByRole('table', { name: 'Calculated Sales Report' })).toBeVisible();
  const product = page.getByRole('table', { name: 'Gross margin by product' }).getByRole('row').filter({ hasText: '4800000100011' });
  await expect(product).toContainText('₱17,385.00');
  await expect(product).toContainText('PL000013, PL000030');
  const line = page.getByRole('table', { name: 'Price book comparison' }).getByRole('row').filter({ hasText: 'PL000013' }).filter({ hasText: '4800000100011' });
  await expect(line.locator('th, td')).toHaveText(['PL000013', '4800000100011', '24" IPS Monitor FHD 100Hz', '2', '₱11,590.00', '₱5,795.00', '₱5,595.00 updated', '₱11,190.00', '₱400.00', 'Matched']);
  await expect(page.getByRole('table', { name: 'Product rows needing review' })).toContainText('Negative quantity or sales (refund/return) excluded from totals.');
});
test('price book changes flow to the calculator without recalculating (Admin, kept-alive page)', async ({ page }) => {
  await signIn(page, ...ACCOUNTS.admin);
  await uploadAndCalculate(page);
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  await nav.getByRole('link', { name: 'Price books' }).click();
  await page.getByRole('link', { name: 'Edit PL000030' }).click();
  await page.getByLabel('Promotional price for 4800000100011').fill('4,795.00');
  await page.getByRole('button', { name: 'Save price book' }).click();
  await nav.getByRole('link', { name: 'Price books' }).click();
  await page.getByRole('button', { name: 'Deactivate PL000013' }).click();
  await nav.getByRole('link', { name: 'Bank rate calculator' }).click();
  const table = page.getByRole('table', { name: 'Price book comparison' });
  await expect(table.getByRole('row').filter({ hasText: 'PL000030' })).toContainText('₱1,000.00');
  await expect(table.getByRole('row').filter({ hasText: 'PL000013' }).first()).toContainText('Price book inactive');
});
test('Product Team change reaches Accounting after sign-in; sample download works', async ({ page }) => {
  await signIn(page, ...ACCOUNTS.product);
  await page.getByRole('link', { name: 'Edit PL000013' }).click();
  await page.getByLabel('Updated selling price for 4800000100011').fill('5,695.00');
  await page.getByRole('button', { name: 'Save price book' }).click();
  await signOut(page);
  await signIn(page, ...ACCOUNTS.accounting);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download sample Sales Report by Product' }).click();
  expect((await download).suggestedFilename()).toBe('Sample Sales Report by Product.xlsx');
  await uploadAndCalculate(page);
  await expect(page.getByRole('table', { name: 'Price book comparison' }).getByRole('row')
    .filter({ hasText: 'PL000013' }).filter({ hasText: '4800000100011' })).toContainText('₱200.00');
});
```
  (`₱17,385.00` = 11,590 + 5,795 net for the monitor.)
- [ ] **Step 2:** `npx playwright test e2e/calculator-insights.spec.ts` — Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npx playwright test e2e/calculator-insights.spec.ts e2e/workflow.spec.ts` — Expected: PASS
  (workflow unedited).
- [ ] **Step 5: Commit** `feat: add product and price book sections to the calculator`

---

### Task 10: Documentation and full verification

- README prototype section: one calculator page (sections 05/06), Price ID format/Auto ID, import of
  products and price lists, sample download, footer skip, access matrix without the sales-report row.
- [ ] `npm test` (backend 77/77, frontend all) · `npm run build` · `npm run test:e2e` (all pass; actual
  report skipped) · `npx prettier --check` on changed code files.
- [ ] Optional real-file check (not committed): `npm run test:sample -- --sales "example output of Zenpos Sales report/Sales Report.xlsx"` still passes.
- [ ] Commit `docs: describe merged calculator, Price IDs and export import`.
