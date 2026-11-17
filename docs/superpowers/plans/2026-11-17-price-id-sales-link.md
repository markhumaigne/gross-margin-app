# Price ID → Sales Report Link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Price books use POS-style Price IDs (`PL000013`, `PS000015`), and the Accounting "Sales report by
product" matches each sale's Price ID to the live price books to show price-book price, expected
revenue and variance alongside actual sales.

**Architecture:** Pure domain changes first (`domain/price-books.ts` ID rules, new
`domain/price-match.ts`, `domain/sales-report.ts` comparison), then UI: the price book editor gets an
Auto ID / manual Price ID field; the sales report page maps a Price ID column, adds a Price ID column
and a "Price book comparison" section, and reads `PriceBookService.books()` in its computed report so
changes show live.

**Tech Stack:** Angular 21 signals, existing domain/test harness (ts-node + node:assert), Playwright.

**Spec:** `docs/superpowers/specs/2026-11-17-price-book-sales-link-design.md` (extends
`docs/superpowers/specs/2026-11-17-price-book-design.md`)

## Global Constraints

- Branch `test` only; commit after each task. Frontend only; no backend, DB or storage changes.
- Price ID format `^(PL|PS)\d{6}$`, stored upper-case, unique (case-insensitive), immutable after creation.
  Auto IDs are `PL` + 6 digits = highest existing `PL` number + 1. Duplicates always get an auto `PL` ID.
- Seed renumbering: `PB-0001`→`PL000013`, `PB-0002`→`PL000030`, `PB-0003`→`PL000034`. Next auto ID `PL000035`.
- Sales rows: blank Price ID = regular price (no price-book figures, not listed in the comparison).
  Matching ignores entry validity dates. Revenue, COGS, gross profit and margin stay on actual sales.
- Price-book price = promo ?? updated ?? master list price (`effectivePrice`), source via `priceSource`.
  Expected revenue = Σ round(priceCents × quantity); variance = actual net sales − expected revenue.
- All existing rules from the first plan still apply (money in centavos, no localStorage, 390 px no
  horizontal scroll, reuse existing CSS classes, prettier on changed files, demonstration labels).

## Review Focus

1. Price IDs typed in lower case or with spaces (` pl000013 ` in a sales file; `ps000015` in the create
   form) — normalised to upper case and matched/stored. Pinned in Task 1 and Task 2.
2. Admin edits a price book, then returns to the kept-alive Sales Report page without re-uploading —
   the comparison must reflect the edit immediately. Pinned in Task 4.
3. An entry with both promo and updated prices — promo is the price-book price. Pinned in Task 2.
4. A product sold partly at regular price and partly under a Price ID — the product row lists both;
   only Price-ID rows enter the comparison. Pinned in Task 2.
5. Manual ID colliding case-insensitively with an existing book (`pl000013`) — rejected with the
   "already used" message. Pinned in Task 1.

---

### Task 1: POS-style Price IDs for price books

**Files:**
- Modify: `frontend/src/app/domain/price-books.ts`, `frontend/src/app/mock-data/price-books.ts`
- Modify tests: `frontend/test/price-books.test.ts` (rename `PB-000N` expectations), `frontend/test/core.test.ts`
  (path `'/price-books/PL000013/edit'`)

**Interfaces:**
- Produces:
  - `PRICE_ID_PATTERN = /^(PL|PS)\d{6}$/`; `normalizePriceId(value: unknown): string` (trim + upper-case;
    `''` for null/undefined; numbers stringified).
  - `PriceBookDraft` gains `autoId: boolean` and `id: string`. `emptyDraft` → `autoId: true, id: ''`;
    `draftFromBook` → `autoId: false, id: book.id`.
  - `PriceBookErrors` gains `id?: string`; `hasErrors` includes it.
  - `validatePriceBook(...)`: only when `editingId === null && !draft.autoId`: invalid →
    `Price ID must be PL or PS followed by 6 digits (e.g. PL000123).`; taken →
    `Price ID <NORMALISED> is already used.`
  - `nextPriceBookId(books)` → `'PL' + String(maxPL + 1).padStart(6, '0')` (`PS` books ignored).
  - `savePriceBook` create: id = autoId ? `nextPriceBookId` : `normalizePriceId(draft.id)`; edit keeps id.
  - Seeds renumbered per Global Constraints (names, entries, dates unchanged).

- [ ] **Step 1: Update existing expectations and add failing tests in `price-books.test.ts`**

```ts
test('auto IDs follow the POS price list format', () => {
  assert.equal(nextPriceBookId([]), 'PL000001');
  assert.equal(nextPriceBookId(SEED_PRICE_BOOKS), 'PL000035');
  assert.deepEqual(SEED_PRICE_BOOKS.map((b) => b.id), ['PL000013', 'PL000030', 'PL000034']);
});
test('manual Price IDs are normalised, validated and unique', () => {
  const manual = (id: string) => ({ ...base(), autoId: false, id });
  const e = (id: string) => validatePriceBook(manual(id), SEED_PRICE_BOOKS, PRODUCTS, null).id;
  assert.equal(e(' ps000015 '), undefined);
  assert.equal(e('PX123'), 'Price ID must be PL or PS followed by 6 digits (e.g. PL000123).');
  assert.equal(e('pl000013'), 'Price ID PL000013 is already used.');
  const { book } = expectOk(savePriceBook(SEED_PRICE_BOOKS, manual(' ps000015 '), null, PRODUCTS, 'x', now));
  assert.equal(book.id, 'PS000015');
  const auto = expectOk(savePriceBook(SEED_PRICE_BOOKS, base(), null, PRODUCTS, 'x', now));
  assert.equal(auto.book.id, 'PL000035');
});
test('editing never changes the Price ID', () => {
  const d = { ...draftFromBook(SEED_PRICE_BOOKS[0]), id: 'PL999999' };
  assert.equal(expectOk(savePriceBook(SEED_PRICE_BOOKS, d, 'PL000013', PRODUCTS, 'x', now)).book.id, 'PL000013');
});
```
  Existing tests: replace `PB-0001/2/3/4` with `PL000013/PL000030/PL000034/PL000035`, `PB-9999`/`PB-9`
  with `PL999999`, the empty-list id with `PL000001`, and the filter query `'pb-0002'` with `'pl000030'`.
  Duplicate test expects `PL000035` then `PL000036`.

- [ ] **Step 2: Run `npm run test -w frontend`** — Expected: FAIL (type errors / old IDs).
- [ ] **Step 3: Implement the interface changes and renumber seeds.**
- [ ] **Step 4: Run `npm run test -w frontend`** — Expected: all pass.
- [ ] **Step 5: Commit** `feat: use POS-style Price IDs for price books`

---

### Task 2: Match sales rows to price books and build the comparison

**Files:**
- Create: `frontend/src/app/domain/price-match.ts`
- Modify: `frontend/src/app/domain/sales-report.ts`, `frontend/src/app/mock-data/sample-sales.ts`
- Modify: `frontend/src/app/pages/sales-report/sales-report.component.ts` — only `EMPTY_MAPPING` gains
  `priceId: null` so the app keeps compiling (UI work is Task 4)
- Modify tests: `frontend/test/sales-report.test.ts` (+ import in `run.ts` unchanged)

**Interfaces:**
- Consumes: `PriceBook`, `normalizePriceId` (Task 1); `effectivePrice`, `priceSource`, `Product`.
- Produces (`price-match.ts`):
  - `type PriceMatchStatus = 'matched' | 'not-found' | 'inactive' | 'not-in-book'`
  - `interface PriceMatch { status: PriceMatchStatus; price: number | null; source: 'promo' | 'updated' | 'master' | null }`
  - `matchPriceBook(books: readonly PriceBook[], priceId: string, product: Product): PriceMatch`
    (book lookup by normalised ID; inactive → `inactive`; entry missing → `not-in-book`; else `matched`).
  - `PRICE_MATCH_LABELS: Record<PriceMatchStatus, string>` = Matched / Price ID not found /
    Price book inactive / Product not in price book.
- Produces (`sales-report.ts`):
  - `SalesField` adds `'priceId'`; `FIELD_LABELS.priceId = 'Price ID'`; detection aliases (normalised):
    `priceid, pricebookid, pricelistid, pricelist, pricebook` (detected before productName aliases).
  - `ProductSalesLine` adds `priceIds: string[]` (distinct non-blank, sorted) and `regularPriceRows: number`.
  - `interface PriceComparisonLine { priceId: string; productId: string; productName: string; quantity: number; actualNetSales: number; price: number | null; priceSource: 'promo' | 'updated' | 'master' | null; expectedRevenue: number | null; variance: number | null; status: PriceMatchStatus }`
  - `interface PriceComparison { lines: PriceComparisonLine[]; matchedLines: number; actualNetSales: number; expectedRevenue: number; variance: number }` (totals over matched lines only).
  - `SalesReportResult` adds `priceComparison: PriceComparison`.
  - `buildSalesReport(rows, options, catalog, priceBooks: readonly PriceBook[] = [])`.
  - Included rows with a non-matched status get warning issues (excluded: false):
    `Price ID <ID> not found in price books.` / `Price book <ID> is inactive; no price-book price applied.` /
    `Product is not in price book <ID>.`
  - Comparison lines grouped by Price ID + product, sorted by Price ID then Product ID.
- `sample-sales.ts`: header becomes `['Product ID', 'Product Name', 'Date', 'Price ID', 'Qty', 'Net Sales', 'Unit Cost']`;
  Price IDs: `4800000100011` 2026-10-01 → `PL000013`; `4800000200014` (qty 3) → `PL000013`;
  `4800000100011` 2026-10-07 → `PL000030`; `4800000600016` → `PS000015`; `4800000100035` → `PL000013`;
  the refund row → `PL000013`; every other row blank. Values otherwise unchanged.

- [ ] **Step 1: Write the failing tests** (add `priceId: null` to existing `detectMapping` deep-equals;
  sample header assertion becomes `'Product ID,Product Name,Date,Price ID,Qty,Net Sales,Unit Cost'`; sample
  non-excluded issue count becomes 3)

```ts
const book = (o: Partial<PriceBook>): PriceBook => ({ id: 'PL000013', name: 'B', description: '', effectiveDate: '2026-01-01',
  expirationDate: null, active: true, updatedAt: '', updatedBy: '', entries: [], ...o });
const entry = (productId: string, updatedPrice: number | null, promoPrice: number | null) =>
  ({ productId, updatedPrice, promoPrice, effectiveStart: '2026-01-01', effectiveEnd: null, memo: '' });
const books = [
  book({ entries: [entry('A-1', 5595, null), entry('B-2', 1395, 999)] }),
  book({ id: 'PL000034', active: false, entries: [entry('A-1', 5000, null)] }),
];
const P = ['SKU', 'Price ID', 'Qty', 'Net Total', 'Unit Cost'];
test('Price ID column is detected', () => {
  assert.equal(detectMapping(P).mapping.priceId, 1);
  assert.equal(detectMapping(['Product ID', 'PriceList', 'Qty', 'Amount']).mapping.priceId, 1);
});
test('rows are matched to price books by Price ID', () => {
  const rows = [P, ['A-1', ' pl000013 ', 2, 11590, 4861], ['B-2', 'PL000013', 1, 1295, 800], ['A-1', '', 1, 6190, 4861],
    ['A-1', 'PL000034', 1, 6000, 4861], ['A-1', 'PS000099', 1, 6000, 4861], ['A-1', 'PL000013', 0, 1, 1]];
  const r = buildSalesReport(rows, { headerRow: 0, ...detectMapping(P), useEstimatedCost: false }, catalog, books);
  assert.deepEqual(r.priceComparison.lines.map((l) => [l.priceId, l.productId, l.status, l.price, l.priceSource, l.expectedRevenue, l.variance]), [
    ['PL000013', 'A-1', 'matched', 5595, 'updated', 11190, 400],
    ['PL000013', 'B-2', 'matched', 999, 'promo', 999, 296],
    ['PL000034', 'A-1', 'inactive', null, null, null, null],
    ['PS000099', 'A-1', 'not-found', null, null, null, null],
  ]);
  assert.deepEqual([r.priceComparison.matchedLines, r.priceComparison.actualNetSales, r.priceComparison.expectedRevenue, r.priceComparison.variance], [2, 12885, 12189, 696]);
  const a = r.lines.find((l) => l.productId === 'A-1')!;
  assert.deepEqual([a.priceIds, a.regularPriceRows, a.netSales], [['PL000013', 'PL000034', 'PS000099'], 1, 29780]);
  assert.ok(r.issues.some((i) => i.message === 'Price book PL000034 is inactive; no price-book price applied.'));
  assert.ok(r.issues.some((i) => i.message === 'Price ID PS000099 not found in price books.'));
});
test('a product missing from the named price book is reported', () => {
  const rows = [P, ['B-2', 'PL000034', 1, 1295, 800]];
  const live = [book({ id: 'PL000034', entries: [entry('A-1', 5000, null)] })];
  const r = buildSalesReport(rows, { headerRow: 0, ...detectMapping(P), useEstimatedCost: false }, catalog, live);
  assert.equal(r.priceComparison.lines[0].status, 'not-in-book');
  assert.equal(r.issues[0].message, 'Product is not in price book PL000034.');
});
test('without a Price ID column every sale is regular price', () => {
  const r = run([H, ['A-1', 'x', 1, 6190, 4861]]);
  assert.deepEqual([r.priceComparison.lines, r.lines[0].priceIds, r.lines[0].regularPriceRows], [[], [], 1]);
});
test('demo sample links to the seed price books', () => {
  const rows = SAMPLE_SALES_ROWS.map((r) => [...r]);
  const r = buildSalesReport(rows, { headerRow: 0, ...detectMapping(rows[0]), useEstimatedCost: false }, PRODUCTS, SEED_PRICE_BOOKS);
  assert.deepEqual(r.priceComparison.lines.map((l) => [l.priceId, l.productId, l.status, l.variance]), [
    ['PL000013', '4800000100011', 'matched', 400], ['PL000013', '4800000100035', 'not-in-book', null],
    ['PL000013', '4800000200014', 'matched', -300], ['PL000030', '4800000100011', 'matched', 800],
    ['PS000015', '4800000600016', 'not-found', null]]);
  assert.deepEqual([r.priceComparison.actualNetSales, r.priceComparison.expectedRevenue, r.priceComparison.variance], [21270, 20370, 900]);
});
```

- [ ] **Step 2: Run `npm run test -w frontend`** — Expected: FAIL.
- [ ] **Step 3: Implement `price-match.ts`, the sales-report changes and the sample Price IDs.**
- [ ] **Step 4: Run `npm run test -w frontend`** — Expected: all pass. Run `npm run build -w frontend` —
  Expected: success.
- [ ] **Step 5: Commit** `feat: match sales rows to price books by Price ID`

---

### Task 3: Auto ID / manual Price ID in the price book editor

**Files:**
- Modify: `frontend/src/app/pages/price-books/price-book-editor.component.ts` + `.html`
- Modify: `e2e/price-books.spec.ts` (all `PB-000N` → new IDs; created/duplicated book is `PL000035`)

**Interfaces:**
- Consumes: Task 1 draft fields/errors.
- Create mode replaces the read-only "Price book ID" with: checkbox labelled `Auto ID` (checked by
  default), input labelled `Price ID` (disabled while Auto ID is on, showing the next auto ID as its
  placeholder; uppercase as typed), field error from `shownErrors().id`. Edit/view keep the read-only ID.
- `updateAutoId(event)` sets `draft.autoId`; `updateField('id', event)` covers the input.

- [ ] **Step 1: Update `e2e/price-books.spec.ts` IDs and add the failing test**

```ts
test('manual Price ID mirrors a POS price list and is validated', async ({ page }) => {
  await signIn(page, ...ACCOUNTS.product);
  await page.getByRole('link', { name: 'New price book' }).click();
  await expect(page.getByLabel('Price ID', { exact: true })).toBeDisabled();
  await page.getByLabel('Auto ID').uncheck();
  await page.getByLabel('Price book name').fill('Headset Promo');
  await page.getByLabel('Price ID', { exact: true }).fill('pl000013');
  await page.getByRole('button', { name: 'Save price book' }).click();
  await expect(page.getByText('Price ID PL000013 is already used.')).toBeVisible();
  await page.getByLabel('Price ID', { exact: true }).fill('PX12');
  await expect(page.getByText('Price ID must be PL or PS followed by 6 digits (e.g. PL000123).')).toBeVisible();
  await page.getByLabel('Price ID', { exact: true }).fill('ps000015');
  await page.getByRole('button', { name: 'Save price book' }).click();
  await expect(page).toHaveURL(/\/price-books\/PS000015$/);
});
```

- [ ] **Step 2: Run `npx playwright test e2e/price-books.spec.ts`** — Expected: FAIL.
- [ ] **Step 3: Implement the editor field.**
- [ ] **Step 4: Run `npx playwright test e2e/price-books.spec.ts e2e/access-control.spec.ts`** — Expected: PASS.
- [ ] **Step 5: Commit** `feat: add Auto ID and manual Price ID to price book editor`

---

### Task 4: Sales report shows Price IDs and the price book comparison

**Files:**
- Modify: `frontend/src/app/pages/sales-report/sales-report.component.ts` + `.html`, `frontend/src/styles.scss`
- Modify: `e2e/sales-report.spec.ts` (gross-margin row array gains a 9th cell `Regular price`; demo review
  rows become 5)
- Create: `e2e/price-link.spec.ts`

**Interfaces:**
- Consumes: Task 2 (`buildSalesReport(..., priceBooks)`, `PRICE_MATCH_LABELS`), `PriceBookService.books()`.
- Component: `fields` adds `'priceId'` (select labelled `Price ID column`); `EMPTY_MAPPING.priceId = null`;
  `report` computed passes `this.priceBooks.books()` (so edits show live, including on the kept-alive page).
- Gross margin table: last column `Price ID` = `priceIds` joined `, ` plus `, Regular price` when
  `regularPriceRows > 0`; `Regular price` alone when no IDs.
- New section (between gross margin and review, renumber review to 04) `Price book comparison`, shown when
  `priceComparison.lines.length`: metrics `Price-book sales (actual)`, `Expected at price-book prices`,
  `Variance` (small text `<matchedLines> matched lines`); table `Price book comparison` with columns
  Price ID, Product ID, Product name, Qty, Actual net sales, Price-book price (caption `promo`/`updated`/`master`),
  Expected revenue, Variance, Status (pill; non-matched `.warning`); blanks `—`; footnote
  `Rows with a Price ID use that price book's promotional price, else its updated price. Variance = actual net sales − expected revenue. Rows without a Price ID sold at regular price and are not compared.`
  When the report has no Price-ID rows: info line `No sales in this report carry a Price ID; all were treated as regular price.`

- [ ] **Step 1: Write the failing e2e tests in `e2e/price-link.spec.ts`**

```ts
const comparisonRow = (page: Page, priceId: string, productId: string) =>
  page.getByRole('table', { name: 'Price book comparison' }).getByRole('row')
    .filter({ hasText: priceId }).filter({ hasText: productId });
test('Accounting sees price-book price, expected revenue and variance by Price ID', async ({ page }) => {
  await signIn(page, ...ACCOUNTS.accounting);
  await page.getByRole('button', { name: 'Load demo report' }).click();
  const row = comparisonRow(page, 'PL000013', '4800000100011');
  await expect(row.locator('td')).toHaveText(['PL000013', '4800000100011', '24" IPS Monitor FHD 100Hz', '2',
    '₱11,590.00', '₱5,595.00 updated', '₱11,190.00', '₱400.00', 'Matched']);
  await expect(comparisonRow(page, 'PS000015', '4800000600016')).toContainText('Price ID not found');
  await expect(page.getByRole('table', { name: 'Sales by product' }).getByRole('row')
    .filter({ hasText: '4800000100011' })).toContainText('PL000013, PL000030');
});
test('Product Team price changes and deactivation flow to Accounting', async ({ page }) => {
  await signIn(page, ...ACCOUNTS.product);
  await page.getByRole('link', { name: 'Edit PL000013' }).click();
  await page.getByLabel('Updated selling price for 4800000100011').fill('5,695.00');
  await page.getByRole('button', { name: 'Save price book' }).click();
  await signOut(page);
  await signIn(page, ...ACCOUNTS.accounting);
  await page.getByRole('button', { name: 'Load demo report' }).click();
  await expect(comparisonRow(page, 'PL000013', '4800000100011')).toContainText('₱11,390.00');
  await expect(comparisonRow(page, 'PL000013', '4800000100011')).toContainText('₱200.00');
  await signOut(page);
  await signIn(page, ...ACCOUNTS.product);
  await page.getByRole('button', { name: 'Deactivate PL000013' }).click();
  await signOut(page);
  await signIn(page, ...ACCOUNTS.accounting);
  await page.getByRole('button', { name: 'Load demo report' }).click();
  await expect(comparisonRow(page, 'PL000013', '4800000100011')).toContainText('Price book inactive');
});
test('Admin edits a price book and the kept-alive report updates without re-uploading', async ({ page }) => {
  await signIn(page, ...ACCOUNTS.admin);
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  await nav.getByRole('link', { name: 'Sales report by product' }).click();
  await page.getByRole('button', { name: 'Load demo report' }).click();
  await nav.getByRole('link', { name: 'Price books' }).click();
  await page.getByRole('link', { name: 'Edit PL000030' }).click();
  await page.getByLabel('Promotional price for 4800000100011').fill('4,795.00');
  await page.getByRole('button', { name: 'Save price book' }).click();
  await nav.getByRole('link', { name: 'Sales report by product' }).click();
  await expect(comparisonRow(page, 'PL000030', '4800000100011')).toContainText('₱1,000.00');
});
```
  Also update `e2e/sales-report.spec.ts`: first test's gross-margin `toHaveText` array appends
  `'Regular price'`; demo review count `toHaveCount(5)`.

- [ ] **Step 2: Run `npx playwright test e2e/price-link.spec.ts e2e/sales-report.spec.ts`** — Expected: FAIL.
- [ ] **Step 3: Implement the page changes and styles.**
- [ ] **Step 4: Run `npx playwright test e2e/price-link.spec.ts e2e/sales-report.spec.ts`** — Expected: PASS.
- [ ] **Step 5: Commit** `feat: show Price IDs and price book comparison in sales report`

---

### Task 5: Documentation and full verification

**Files:** Modify `README.md` (prototype section: Price ID format and Auto ID; Sales Report Price ID
matching, comparison, variance formula, live link; demo sample now has Price IDs).

- [ ] **Step 1: `npm test`** — Expected: backend 76/76 and all frontend checks pass.
- [ ] **Step 2: `npm run build`** — Expected: success, `xlsx` still in a lazy chunk.
- [ ] **Step 3: `npm run test:e2e`** — Expected: all pass (actual-report test skipped).
- [ ] **Step 4: `npx prettier --check` on changed code files** — Expected: clean (README excluded, as before).
- [ ] **Step 5: Commit** `docs: describe Price ID matching and price book comparison`
