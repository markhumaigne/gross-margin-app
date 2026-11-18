# ZenPOS Price Book Import and Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Price books are imported from ZenPOS Price Book exports (PL/PS/PI), PS rows carry a hand-entered Support (₱ per unit or %), price book margins use ZenPOS's margin-on-cost, and the calculator adds Support to PS sales.

**Architecture:** Pure domain modules in `frontend/src/app/domain` do all parsing, merging and math (`zenpos-price-book.ts`, `price-book-import.ts`, `support.ts`). Imported rows reuse the existing per-entry `manual` details. Angular components only wire signals to those functions. Persistence stays in the one localStorage snapshot.

**Tech Stack:** Angular 21 standalone components + signals, SheetJS (`xlsx`) in the browser, `ts-node` unit tests (`frontend/test`, custom harness), Playwright e2e (`e2e/`).

**Spec:** `docs/superpowers/specs/2026-11-18-zenpos-price-book-import-design.md`

## Global Constraints

- Price ID pattern: `^(PL|PS|PI)\d{6}$`. Invalid-ID message: `Price ID must be PL, PS or PI followed by 6 digits (e.g. PL000123).`
- Support only exists on PS books (`isSupportBook(id)`). Saving or importing a PL/PI book never stores Support.
- **Margin on cost** = (price − cost) ÷ cost × 100, via `percentOf` (2 decimals). A cost of 0 or less gives `null`, shown as "—".
- **Margin after support** = (price − net cost) ÷ net cost × 100, with net cost = cost − support per unit. A net cost of 0 or less gives `null`.
- **Support per unit:** amount → value; percent → price × value ÷ 100, rounded to the centavo.
- **Calculator support per sales row:** amount → value × qty; percent → row net sales × value ÷ 100; rounded to the centavo. Rows with net sales ≤ 0 earn 0.
- All money arithmetic goes through `domain/money.ts` (`toCents`, `fromCents`, `parseMoney`, `percentOf`).
- Data saved by the current version (`ledger.pricing.v1`, `version: 1`, manual entries that still carry `margin`) must keep loading.
- UI labels, exactly:
  - Price books: `Margin on cost`, `Support`, `Margin after support`
  - Calculator: `Gross margin on sales`, `Gross margin on sales %`, `Support`, `Gross margin after support`, `Gross margin after support %`, `Support to claim`
- No new dependencies. Tests use synthetic data only. The real ZenPOS samples are git-ignored company data and must not be committed or copied into fixtures.
- Commands, run from the repo root:
  - Unit tests: `npm test -w frontend`. The runner executes every file listed in `frontend/test/run.ts`.
  - Build: `npm run build -w frontend`
  - E2E: `npx playwright test e2e/<file>.spec.ts`
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Barcodes:**
   - A 13-digit barcode stored as an Excel number must import as all its digits (`4548736146242`), never `4.54874E+12`.
   - A text ID keeps its leading zero (`097855213693`).
   - Pinned in Task 4.
2. **Formatted amounts:** a CSV or re-saved export can carry amounts as text (`"5,190.00"`). They must parse like numbers. Pinned in Task 4.
3. **Matching on re-import:** a product whose ID differs only by case or surrounding spaces from the existing row must keep its Support. Pinned in Task 5.
4. **Same file twice:** uploading the same file twice must change nothing and report `0 added, 0 removed, 0 prices changed`. Pinned in Task 5.
5. **Support at or above cost:** Support equal to or above cost must show margin after support as "—", not a huge or negative number. Pinned in Task 2.

---

### Task 1: PI Price IDs and same-prefix Duplicate

**Files:**
- Modify: `frontend/src/app/domain/price-books.ts` (`PRICE_ID_PATTERN`, the ID error text in `validatePriceBook`, `nextPriceBookId`, `duplicatePriceBook`)
- Test: `frontend/test/price-books.test.ts`
- Modify: `e2e/price-books.spec.ts` (the old ID error text in the "manual Price ID mirrors a POS price list" test)

**Interfaces:**
- Produces:
  - `export type PriceIdPrefix = 'PL' | 'PS' | 'PI'`
  - `export const PRICE_ID_PATTERN = /^(PL|PS|PI)\d{6}$/`
  - `export function priceIdPrefix(id: string): PriceIdPrefix` (falls back to `'PL'`)
  - `export function isSupportBook(id: string): boolean` (true only for a `PS` prefix)
  - `export function nextPriceBookId(books: readonly PriceBook[], prefix: PriceIdPrefix = 'PL'): string`

- [ ] **Step 1: Write the failing tests** in `frontend/test/price-books.test.ts`:

```ts
test('PI Price IDs are accepted and the error names all three prefixes', () => {
  const draft = { ...emptyDraft('2026-11-18'), autoId: false, id: 'pi000004', name: 'Internal' };
  assert.equal(validatePriceBook(draft, SEED_PRICE_BOOKS, PRODUCTS, null).id, undefined);
  const bad = validatePriceBook({ ...draft, id: 'PX000001' }, SEED_PRICE_BOOKS, PRODUCTS, null);
  assert.equal(bad.id, 'Price ID must be PL, PS or PI followed by 6 digits (e.g. PL000123).');
  assert.equal(isSupportBook('PS000005'), true);
  assert.equal(isSupportBook('PI000005'), false);
  assert.equal(isSupportBook('PL000005'), false);
});

test('automatic IDs count per prefix', () => {
  const books = [book('PS000005'), book('PS000010'), book('PL000034')];
  assert.equal(nextPriceBookId(books, 'PS'), 'PS000011');
  assert.equal(nextPriceBookId(books, 'PI'), 'PI000001');
  assert.equal(nextPriceBookId(books), 'PL000035');
});

test('duplicating a PS book gives the copy the next PS number', () => {
  const books = [...SEED_PRICE_BOOKS, book('PS000010')];
  const { book: copy } = expectOk(duplicatePriceBook(books, 'PS000010', 'Lead', new Date()));
  assert.equal(copy.id, 'PS000011');
});
```

`book(id)` is a small local helper returning a valid empty `PriceBook` with that id and a unique name. Reuse one if the file already has it.

- [ ] **Step 2: Run** `npm test -w frontend`. Expected: the three new checks FAIL.
- [ ] **Step 3: Implement the interfaces above.**
  - `nextPriceBookId` keeps its existing overflow fallback (reuse the first free number after `999999`), now per prefix.
  - `duplicatePriceBook` uses `nextPriceBookId(books, priceIdPrefix(source.id))`.
  - The manual-ID rule still rejects IDs already used.
- [ ] **Step 4: Run** `npm test -w frontend`. Expected: all checks pass.
- [ ] **Step 5: Update** the e2e expectation in `e2e/price-books.spec.ts` to the new error text, then run `npx playwright test e2e/price-books.spec.ts`. Expected: pass.
- [ ] **Step 6: Commit** `feat: accept PI Price IDs and keep the prefix when duplicating`.

---

### Task 2: Support and margin math

**Files:**
- Create: `frontend/src/app/domain/support.ts`
- Test: `frontend/test/support.test.ts` (register it in `frontend/test/run.ts`)

**Interfaces:**
- Produces:

```ts
export type SupportKind = 'amount' | 'percent';
export interface Support { kind: SupportKind; value: number }
export interface SupportDraft { kind: SupportKind; value: string }
export const NO_SUPPORT_DRAFT: SupportDraft; // { kind: 'amount', value: '' }
export function validateSupportDraft(draft: SupportDraft): string | null;
export function supportFromDraft(draft: SupportDraft | undefined): Support | undefined; // blank → undefined
export function supportToDraft(support: Support | undefined): SupportDraft;             // value as toFixed(2)
export function supportPerUnit(price: number, support: Support): number;
export function marginOnCost(price: number, cost: number): number | null;
export function marginAfterSupport(price: number, cost: number, support: Support | undefined): number | null;
export function saleSupportCents(support: Support, quantity: number, netSalesCents: number): number;
```

- Error messages:
  - `Support must be zero or more with up to 2 decimals.`
  - `Support % cannot exceed 100.`

- [ ] **Step 1: Write the failing tests** in `frontend/test/support.test.ts`:

```ts
test('margin on cost matches ZenPOS', () => {
  assert.equal(marginOnCost(5190, 4750), 9.26);
  assert.equal(marginOnCost(11999, 12749.25), -5.88);
  assert.equal(marginOnCost(100, 0), null);
});

test('margin after support lowers cost by the support per unit', () => {
  assert.equal(marginAfterSupport(11999, 12749.25, { kind: 'amount', value: 1500 }), 6.66);
  assert.equal(supportPerUnit(2795, { kind: 'percent', value: 5 }), 139.75);
  assert.equal(marginAfterSupport(2795, 1960, { kind: 'percent', value: 5 }), 53.55);
  assert.equal(supportPerUnit(99.99, { kind: 'percent', value: 12.5 }), 12.5);
  assert.equal(marginAfterSupport(5190, 4750, undefined), 9.26);
});

test('support at or above cost leaves margin after support blank', () => {
  assert.equal(marginAfterSupport(1000, 900, { kind: 'amount', value: 900 }), null);
  assert.equal(marginAfterSupport(1000, 900, { kind: 'amount', value: 950 }), null);
});

test('support earned on a sale', () => {
  assert.equal(saleSupportCents({ kind: 'amount', value: 1500 }, 2, 2399800), 300000);
  assert.equal(saleSupportCents({ kind: 'percent', value: 5 }, 2, 559000), 27950);
  assert.equal(saleSupportCents({ kind: 'amount', value: 1500 }, 1, 0), 0);
});

test('support drafts validate and convert', () => {
  assert.equal(validateSupportDraft({ kind: 'amount', value: '' }), null);
  assert.equal(validateSupportDraft({ kind: 'amount', value: '1,500' }), null);
  assert.equal(
    validateSupportDraft({ kind: 'amount', value: '-1' }),
    'Support must be zero or more with up to 2 decimals.',
  );
  assert.equal(
    validateSupportDraft({ kind: 'percent', value: '100.01' }),
    'Support % cannot exceed 100.',
  );
  assert.equal(supportFromDraft({ kind: 'amount', value: ' ' }), undefined);
  assert.deepEqual(supportFromDraft({ kind: 'percent', value: '5' }), { kind: 'percent', value: 5 });
  assert.deepEqual(supportToDraft(undefined), NO_SUPPORT_DRAFT);
  assert.deepEqual(supportToDraft({ kind: 'amount', value: 1500 }), { kind: 'amount', value: '1500.00' });
});
```

- [ ] **Step 2: Run** `npm test -w frontend`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement `support.ts`** using `percentOf`, `toCents` and `fromCents`.
  - Percent support per unit is `Math.round(toCents(price) * value / 100)` centavos.
  - `saleSupportCents` returns 0 when `netSalesCents <= 0`.
- [ ] **Step 4: Run** `npm test -w frontend`. Expected: all pass.
- [ ] **Step 5: Commit** `feat: add support and margin-on-cost math`.

---

### Task 3: Entries carry Support; margin is calculated; Qty may be 0

**Files:**
- Modify:
  - `frontend/src/app/domain/pricing.ts`: `PriceBookEntry`, `PriceBookEntryDraft`, `validateEntryDraft`, `entryFromDraft`, `entryToDraft`; delete `marginPercent` once unused.
  - `frontend/src/app/domain/manual-products.ts`: drop `margin` from `ManualProduct`, `MANUAL_PRODUCT_FIELDS`, `emptyManualProduct`, from/to draft; quantities allow 0.
  - `frontend/src/app/domain/price-books.ts`: `savePriceBook` strips Support unless `isSupportBook(id)`; `duplicatePriceBook` deep-copies `support`.
  - `frontend/src/app/domain/pricing-storage.ts`: `validEntry` accepts an optional valid `support`; old `manual.margin` is ignored.
  - `frontend/src/app/pages/price-books/price-book-editor.component.ts/.html`: the margin column becomes `Margin on cost`, using `marginOnCost` for manual rows (`manual.netPrice`, `manual.cost`) and catalog rows (effective price, `product.cost`). Keeps the build green.
  - `frontend/src/app/pages/price-books/product-picker.component.ts`: the catalog tab margin uses `marginOnCost`.
- Test: `frontend/test/price-books.test.ts`, `frontend/test/pricing-storage.test.ts`, `frontend/test/pricing.test.ts`
- Modify e2e:
  - `e2e/manual-products.spec.ts`: remove the `Margin` fill. The expected margin `-5.56%` becomes `-5.26%`, i.e. (900 − 950) ÷ 950.
  - `e2e/price-books.spec.ts`: in "editor shows unit, cost and margin", `-23.80%` becomes `-19.22%`, i.e. (4000 − 4952) ÷ 4952.

**Interfaces:**
- Consumes:
  - Task 2: `Support`, `SupportDraft`, `validateSupportDraft`, `supportFromDraft`, `supportToDraft`, `marginOnCost`
  - Task 1: `isSupportBook`
- Produces:
  - `PriceBookEntry.support?: Support`
  - `PriceBookEntryDraft.support?: SupportDraft`
  - `ManualProduct` without `margin`
  - `manual-products.ts` quantity rule: Qty ≥ 0, to Qty ≥ Qty. The error reads `${label} must be zero or more.`

- [ ] **Step 1: Write the failing tests:**
  - `price-books.test.ts`:
    - `'PS entries keep Support and PL entries drop it on save'`. Saving a PS draft (manual ID `PS000077`) with an entry `support: { kind: 'amount', value: '1500' }` stores `{ kind: 'amount', value: 1500 }`. The same draft saved as `PL000077` stores no `support` key.
    - `'invalid Support blocks saving'`. Value `'-5'` puts `Support must be zero or more with up to 2 decimals.` in `errors.entries[productId]`.
    - `'duplicate copies Support to the next PS number'`. The copy's entry `support` deep-equals the source's, and is not the same object.
    - `'manual products accept Qty 0 and store no typed margin'`. Qty `'0'`, to Qty `'99999'` validates, and the saved `manual` has no `margin` key.
  - `pricing-storage.test.ts`:
    - `'pricing saved before Support still loads'`. A snapshot whose manual entry includes `margin: -5.56` and no `support` reads `ok`.
    - `'Support round trips and invalid Support is rejected'`. `support: { kind: 'percent', value: 101 }` makes `readPricingStorage` fail with the existing unreadable message.
  - Update the existing tests that pass `margin` or reject Qty `0` to match the new rules.
- [ ] **Step 2: Run** `npm test -w frontend`. Expected: the new checks FAIL.
- [ ] **Step 3: Implement the model, validation and storage changes,** then the editor and picker margin swap.
- [ ] **Step 4: Run** `npm test -w frontend` and `npm run build -w frontend`. Expected: all pass, and the build succeeds.
- [ ] **Step 5: Run** `npx playwright test e2e/manual-products.spec.ts e2e/price-books.spec.ts`. Expected: pass with the updated margins.
- [ ] **Step 6: Commit** `feat: store Support on PS entries and calculate margin on cost`.

---

### Task 4: ZenPOS price book parser and sample file

**Files:**
- Create:
  - `frontend/src/app/domain/zenpos-price-book.ts`
  - `frontend/src/app/mock-data/sample-price-book.ts`
  - `frontend/src/app/domain/sample-price-book-file.ts`
- Test: `frontend/test/zenpos-price-book.test.ts` (register in `run.ts`)

**Interfaces:**
- Consumes: `PRICE_ID_PATTERN`, `normalizePriceId` (Task 1), `parseMoney`, `isBlank`, `Result`.
- Produces:

```ts
export interface ZenposProductRow {
  productId: string; name: string; qty: number; toQty: number | null; unit: string;
  unitPrice: number; discount: number; discountPercent: number; netPrice: number; cost: number;
}
export interface ZenposPriceBook {
  priceId: string; name: string; active: boolean; memo: string;
  period: { start: string; end: string } | null; // ISO dates
  products: ZenposProductRow[]; skippedRows: number;
}
export const NOT_A_PRICE_BOOK = 'This file is not a ZenPOS price book export (no Price ID or product header found).';
export function zenposProductId(value: unknown): string;
export function parseZenposPriceBook(rows: readonly unknown[][]): Result<ZenposPriceBook>;
// sample-price-book-file.ts
export const SAMPLE_PRICE_BOOK_FILE_NAME = 'Sample ZenPOS Price Book PS000015.xlsx';
export function buildSamplePriceBookWorkbook(): Promise<ArrayBuffer>; // one sheet named 'Price Book'
// mock-data/sample-price-book.ts
export const SAMPLE_PRICE_BOOK_ROWS: readonly (readonly unknown[])[];
```

**Parsing rules:**
- **Labels.** Find label cells in column A by their text, ignoring case, the trailing colon and spaces: `Price ID`, `Name`, `Active`, `Memo`, `Limited Period`. The value is in column B.
- **Product header.** It is the first row whose normalized cells (lower-case, letters and digits only) include `productid`, `unitprice`, `priceafterdiscount` and `stndcost`. Map every column by its normalized header name: `name`, `qty`, `toqty`, `unit`, `discount`, `disc`.
- **Active** is `Yes` (case-insensitive) → true.
- **Memo** keeps its inner line breaks, trimmed.
- **Limited Period:** `Yes (MM/DD/YYYY~MM/DD/YYYY)` becomes `{ start, end }` ISO dates. Anything else, or an end before the start, becomes `null`.
- **Product IDs** (`zenposProductId`): a number that is a safe integer becomes `String(n)`. Other numbers become `String(n)`. Strings are trimmed. `null` becomes `''`.
- **Amounts** go through `parseMoney`, so `"5,190.00"` reads as 5190.
- **Product rows:**
  - A fully blank row is ignored and not counted.
  - A row is skipped and counted when it has a blank ID, a net price or cost that is blank, unreadable or negative, or a repeated ID (compared with `productIdKey`).
  - Defaults: a blank Unit Price becomes the net price; a blank Discount or Disc % becomes 0; a blank Qty becomes 0; a blank to Qty becomes `null`; a blank Unit becomes `'PCS'`.
- **Errors:**
  - No Price ID label or no product header: `NOT_A_PRICE_BOOK`.
  - A Price ID that fails `PRICE_ID_PATTERN` after `normalizePriceId`: `` `Price ID ${id} is not PL, PS or PI followed by 6 digits.` ``
  - Zero product rows: `The price book has no product rows.`

**Sample rows:** `SAMPLE_PRICE_BOOK_ROWS` follows the real layout.
- Row 0 is `'DEMO TRADING'` and row 1 is `'Price Book'`.
- Label rows at indexes 6–15:
  - Price ID `PS000015`
  - Name `Demo Headset Promo`
  - Active `Yes`
  - Memo `'REF#: DEMO-0001\nNOV. 01 - NOV. 30, 2026'`
  - Limited Period `'Yes (11/01/2026~11/30/2026)'`
  - The five Limited… rows set to `No`
- The header sits at index 18, with `'Price After \n Discount'`.
- Three fictional products, each with Qty 0, to Qty 99999 and Unit PCS:

| Product ID | Name | Unit Price | Price After Discount | Stnd Cost | Margin |
|---|---|---|---|---|---|
| `4800000600016` (number) | `Wireless Headset with Microphone` | 2795 | 2795 | 1960 | `'42.6%'` |
| `4800000600023` (number) | `Demo Earbuds Pro` | 1995 | 1995 | 1500 | `'33%'` |
| `'0480000060003'` (text) | `Demo Speaker Mini` | 1495 | 1495 | 1100 | `'35.9%'` |

- [ ] **Step 1: Write the failing tests.** A local `zenpos(overrides)` helper builds rows in the sample layout.
  - `'reads the header block and product rows of a ZenPOS export'`: asserts `priceId`, `name`, `active`, the multi-line `memo`, `period` `{ start: '2026-11-06', end: '2026-11-19' }`, and that `products[0]` deep-equals `{ productId: '4548736146242', name: 'SONY SRX-XB100 BLACK', qty: 0, toQty: 99999, unit: 'PCS', unitPrice: 2499, discount: 0, discountPercent: 0, netPrice: 2499, cost: 2387 }`. The fixture values are typed by hand.
  - `'barcodes keep every digit and text IDs keep leading zeros'`:
    - `zenposProductId(4548736146242) === '4548736146242'`
    - `zenposProductId(' 097855213693 ') === '097855213693'`
    - `zenposProductId(null) === ''`
  - `'formatted text amounts are read'`: net `'5,190.00'` and cost `'4,750.00'` give 5190 and 4750.
  - `'Limited Period No and Active No'`: `period === null`, `active === false`.
  - `'blank IDs, unreadable prices and repeated IDs are skipped and counted'`: three bad rows plus one fully blank row gives `skippedRows === 3`.
  - `'files that are not ZenPOS price books are rejected'`:
    - Rows shaped like a sales export (header `Product ID, Product Name, Qty, Net Total` on row 0) fail with `NOT_A_PRICE_BOOK`.
    - Price ID `PX000001` fails with `Price ID PX000001 is not PL, PS or PI followed by 6 digits.`
    - A header with no rows fails with `The price book has no product rows.`
  - `'the sample price book file parses'`: `readSpreadsheet(new File([await buildSamplePriceBookWorkbook()], SAMPLE_PRICE_BOOK_FILE_NAME))` then parse gives `priceId 'PS000015'`, three products, and the third product's ID `'0480000060003'`.
- [ ] **Step 2: Run** `npm test -w frontend`. Expected: FAIL.
- [ ] **Step 3: Implement** the parser, the sample rows and the workbook builder. The builder follows `domain/sample-export-file.ts` (dynamic `import('xlsx')`, `aoa_to_sheet`).
- [ ] **Step 4: Run** `npm test -w frontend`. Expected: all pass.
- [ ] **Step 5: Commit** `feat: parse ZenPOS price book exports`.

---

### Task 5: Merge an imported price book into the workspace

**Files:**
- Create: `frontend/src/app/domain/price-book-import.ts`
- Test: `frontend/test/price-book-import.test.ts` (register in `run.ts`)

**Interfaces:**
- Consumes:
  - Task 4: `ZenposPriceBook`
  - Task 1: `isSupportBook`
  - `productIdKey`, `PriceBook`, `PriceBookEntry`
- Produces:

```ts
export interface BookImportSummary {
  fileName: string; priceId: string; created: boolean; products: number;
  added: number; removed: number; pricesChanged: number; supportKept: number; skippedRows: number;
}
export function applyZenposPriceBook(
  books: readonly PriceBook[], parsed: ZenposPriceBook, fileName: string,
  today: string, now: Date, actor: string,
): { books: PriceBook[]; book: PriceBook; summary: BookImportSummary };
export function formatImportSummary(s: BookImportSummary): string;
```

**Merge rules** (spec, Import section):
- **Book header:**
  - Book `id` = `parsed.priceId`.
  - `name` = `parsed.name`. If another book (different ID) has that name, ignoring case, use `` `${name} (${priceId})` ``.
  - `description` = memo; `active` from the file.
  - Dates come from `period`. With no period: a new book gets `today` and no expiration; an existing book keeps its `effectiveDate` and sets `expirationDate: null`.
  - `updatedAt = now.toISOString()`, `updatedBy = actor`.
- **Each entry:**
  - `productId` comes from the file.
  - `updatedPrice` = `netPrice`; `promoPrice: null`.
  - `effectiveStart` / `effectiveEnd` = the book dates.
  - `manual` gets all `ZenposProductRow` fields. `masterListPrice` = the old row's `manual.masterListPrice`, else `unitPrice`.
  - `memo` = the old row's memo or `''`.
  - `support` = the old row's support, only for a PS book.
- **Matching** old to new rows uses `productIdKey`.
- **Counters:**
  - `pricesChanged` counts matched rows whose old effective price (`promoPrice ?? updatedPrice`) differs from the new `netPrice`.
  - `supportKept` counts matched rows that kept a Support.
- **Summary text:**
  - Created: `` `${priceId} created: ${n} products` ``
  - Updated: `` `${priceId} updated: ${added} added, ${removed} removed, ${pricesChanged} prices changed, Support kept on ${supportKept}` ``
  - Either form, when `skippedRows > 0`: append `` `; ${skippedRows} rows skipped` ``
  - Counts use `toLocaleString('en-US')`, e.g. `1,419`.

- [ ] **Step 1: Write the failing tests:**
  - `'a new Price ID creates an editable book from the file'`:
    - Asserts the book fields, entry `manual`, `updatedPrice`, `promoPrice` and dates.
    - Asserts `summary.created === true` and `formatImportSummary` gives `'PS000005 created: 2 products'`.
    - `hasErrors(validatePriceBook(draftFromBook(book), books, [], book.id))` is false.
  - `'Limited Period No: new books start today, existing books keep their start and lose their expiration'`.
  - `'re-importing keeps Support, memo and master list price and reports changes'`:
    - Existing PS000005 rows: A (support amount 1500, memo `'claim'`, master 3000), B (support percent 5), C.
    - The file has A with a new net price, B unchanged, and new D.
    - Summary text: `'PS000005 updated: 1 added, 1 removed, 1 prices changed, Support kept on 2'`. A keeps its support, memo and master; D has no `support`.
  - `'a product ID differing only by case or spaces keeps its Support'`: existing `' ab-1 '`, file `'AB-1'`.
  - `'importing the same file twice changes nothing'`:
    - The second run's entries deep-equal the first's.
    - Its text is `'PS000005 updated: 0 added, 0 removed, 0 prices changed, Support kept on 0'`.
  - `'a name used by another book gets the Price ID appended'`: a file named `Standard Retail 2026` as PS000005 gives `'Standard Retail 2026 (PS000005)'`. Re-importing a book under its own name appends nothing.
  - `'catalog rows of an existing book are replaced by the file'`: importing PL000013 with only `4800000100011` against `SEED_PRICE_BOOKS` leaves one entry, and it has `manual`.
  - `'PL and PI imports never store Support'`.
- [ ] **Step 2: Run** `npm test -w frontend`. Expected: FAIL.
- [ ] **Step 3: Implement** `price-book-import.ts`.
- [ ] **Step 4: Run** `npm test -w frontend`. Expected: all pass.
- [ ] **Step 5: Commit** `feat: merge ZenPOS price books and keep Support on re-import`.

---

### Task 6: Import from the Price books page; remove the sales-export import

**Files:**
- Modify:
  - `frontend/src/app/core/price-book.service.ts`: replace `importFromExport` with `importPriceBooks`.
  - `frontend/src/app/core/sample-download.ts`: add `downloadSamplePriceBook()` and share the blob-download code with `downloadSampleExport`.
  - `frontend/src/app/pages/price-books/price-book-list.component.ts/.html`
  - `frontend/test/sample-export.test.ts`: drop the `importFromExport` assertions.
  - `frontend/test/run.ts`
  - `e2e/price-books.spec.ts`: replace the two sales-export import tests.
- Delete: `frontend/src/app/domain/sales-import.ts`, `frontend/test/sales-import.test.ts`

**Interfaces:**
- Consumes:
  - Task 4: `parseZenposPriceBook`, `buildSamplePriceBookWorkbook`, `SAMPLE_PRICE_BOOK_FILE_NAME`
  - Task 5: `applyZenposPriceBook`, `formatImportSummary`, `BookImportSummary`
- Produces:

```ts
export type FileImportResult =
  | { fileName: string; ok: true; summary: BookImportSummary }
  | { fileName: string; ok: false; error: string };
importPriceBooks(actor: UserAccount, files: readonly File[]): Promise<Result<FileImportResult[]>>; // fails only without permission
```

**Service behaviour, in file order:**
1. Check `validateUploadFile`.
2. `readSpreadsheet`. If it throws, the error is `The file could not be read.`
3. `parseZenposPriceBook`.
4. `workspace.reload()`.
5. `applyZenposPriceBook` with `todayInManila()`, `new Date()` and `actor.displayName`.
6. `workspace.commit(books)`.

- A failure at any step is that file's `{ ok: false, error }`. The loop continues with the next file. A storage-full commit therefore reports `writePricingStorage`'s message for that file only.

**Page:**
- **File input:** `multiple`, `accept=".xlsx,.xls,.csv"`, `aria-label="Import ZenPOS price book files"`.
- **Buttons:** `Import ZenPOS price book` (`Importing…` while busy) and `Download sample price book`.
- **Results:**
  - Successes show in the `role="status"` notice as a list of `` `${fileName}: ${formatImportSummary(summary)}` ``.
  - Failures show in the `role="alert"` box as `` `${fileName}: ${error}` ``.
  - Both can show at once.
- **Hint text:**

  > Import reads ZenPOS “Price Book” exports, one price book per file. A new Price ID creates a price book; an existing one is updated from the file and keeps the Support you entered. Saved prices are shared with Accounting in this browser and kept after refresh.

- [ ] **Step 1: Write the failing e2e tests** in `e2e/price-books.spec.ts`, under `test.describe('Price IDs and ZenPOS import')`. Build workbooks in the test from `SAMPLE_PRICE_BOOK_ROWS`, like the old test built one from `SAMPLE_EXPORT_ROWS`.
  - `'Product Team imports ZenPOS price book exports'`:
    - Upload two files at once: the sample, plus a copy with Price ID `PI000004` and Name `Demo Internal Promo`.
    - The status contains `PS000015 created: 3 products` and `PI000004 created: 3 products`.
    - Reload and sign in. The PS000015 row shows `Demo Headset Promo`, and its view shows `0480000060003`.
    - Upload the sample again. The status contains `PS000015 updated: 0 added, 0 removed, 0 prices changed, Support kept on 0`.
  - `'a file that is not a ZenPOS price book is reported and others still import'`:
    - Upload `notes.csv` (`Name,Qty\r\nx,1`) together with the sample.
    - The alert contains `notes.csv: This file is not a ZenPOS price book export`.
    - The status contains `PS000015 created`.
- [ ] **Step 2: Run** `npx playwright test e2e/price-books.spec.ts`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement** the service, sample download and page changes. Delete `sales-import.ts` and its test, and update `run.ts` and `sample-export.test.ts`.
- [ ] **Step 4: Run** `npm test -w frontend`, `npm run build -w frontend` and `npx playwright test e2e/price-books.spec.ts`. Expected: all pass.
- [ ] **Step 5: Commit** `feat: import ZenPOS price books from the Price books page`.

---

### Task 7: Support in the price book editor and Add products

**Files:**
- Modify:
  - `frontend/src/app/pages/price-books/price-book-editor.component.ts/.html`
  - `frontend/src/app/pages/price-books/product-picker.component.ts/.html`
  - `frontend/src/styles.scss`: only if the new controls need styles; reuse `.price-input`.
- Test: `e2e/manual-products.spec.ts` (new test)

**Interfaces:**
- Consumes:
  - Task 2: `NO_SUPPORT_DRAFT`, `SupportDraft`, `validateSupportDraft`, `supportFromDraft`, `marginOnCost`, `marginAfterSupport`
  - Task 1: `isSupportBook`, `normalizePriceId`
- Produces (component API only):
  - Editor:
    - `readonly supportBook: Signal<boolean>`. It is computed from the book's effective ID: `bookId()` when editing or viewing; in create mode, the typed manual ID, or `nextId()` when Auto ID is on.
    - `updateSupport(productId: string, part: 'kind' | 'value', event: Event)`
  - Picker:
    - `@Input() supportEnabled = false`
    - `manualAdd` emits `{ productId: string; manual: ManualProductDraft; support?: SupportDraft }`

**Editor table:**
- After `Margin on cost`, PS books add the columns `Support` and `Margin after support`. PL and PI books don't show them.
- Each row's margin values come from `marginOnCost` / `marginAfterSupport` with `supportFromDraft(entry.support)`. Invalid support text gives "—".
- **Support cell when editable:**
  - An amount input with `aria-label="Support for {productId}"`.
  - A `<select aria-label="Support type for {productId}">` with options `₱` (`amount`) and `%` (`percent`).
- **Support cell when viewing:** `₱1,500.00`, `5.00%` or `—`.
- Error-row `colspan` follows the actual column count.

**Add products, Manual entry:**
- After Cost, a read-only `Margin on cost` value appears.
- When `supportEnabled`, add:
  - A `Support` input with its `Support type` select.
  - The `validateSupportDraft` error shown under it, blocking `Add product`.
  - A read-only `Margin after support`.
- Editing an existing row pre-fills its support. The editor's `saveManualProduct` stores `support` on the entry.

- [ ] **Step 1: Write the failing e2e test** `'PM enters Support on a PS book and sees margin after support'`:
  - **Create:** a new book with Auto ID off, ID `PS000077`, name `Support test`.
  - **Add the product:** Product ID `SUP-1`, Name `Promo headset`, Qty `0`, to Qty `99999`, Unit `PCS`, Master List Price `12999`, Unit Price `11999`, Disc % `0`, Discount `0`, Net Price `11999`, Cost `12749.25`, Support `1500` (type `₱`).
  - **Check the row:** it shows `-5.88%` and `6.66%`. Save.
  - **Check the view:** the row shows `₱1,500.00` and `6.66%`.
  - **Switch to %:** Edit, set `Support type for SUP-1` to `%` and `Support for SUP-1` to `5`. The row shows `-1.24%`: per unit 599.95, net cost 12,149.30. Save.
  - **PL books:** a PL book (`View PL000013`) has no `Support` column header.
- [ ] **Step 2: Run** `npx playwright test e2e/manual-products.spec.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the editor and picker changes.
- [ ] **Step 4: Run** `npm run build -w frontend`, `npm test -w frontend` and `npx playwright test e2e/manual-products.spec.ts e2e/price-books.spec.ts`. Expected: all pass.
- [ ] **Step 5: Commit** `feat: enter Support on PS price books`.

---

### Task 8: Support in the calculator

**Files:**
- Modify:
  - `frontend/src/app/domain/price-match.ts`
  - `frontend/src/app/domain/sales-report.ts`
  - `frontend/src/app/components/product-insights/product-insights.component.html`
- Test: `frontend/test/price-match.test.ts`, `e2e/calculator-insights.spec.ts` (new test)

**Interfaces:**
- Consumes:
  - Task 2: `Support`, `saleSupportCents`
  - Task 1: `isSupportBook`
- Produces:
  - `PriceMatch.support: Support | null`. It is non-null only for a PS book that contains the product, **including when the book is inactive**.
  - `ProductSalesLine`: `support: number`, `grossProfitAfterSupport: number | null`, `grossMarginAfterSupportPercent: number | null`
  - `SalesReportTotals`: `support: number`, `grossProfitAfterSupport: number`, `grossMarginAfterSupportPercent: number | null`
  - `PriceComparisonLine.support: number`
  - `PriceComparison.support: number` (the "Support to claim" total)

**Calculations:**
- **Each included row with a Price ID:** `saleSupportCents(match.support, quantity, toCents(net))` is added to both the product accumulator and the comparison accumulator.
- **Product line:**
  - `grossProfitAfterSupport` = net − COGS + support.
  - `grossMarginAfterSupportPercent` = `percentOf(that, net)`.
  - Both are `null` when cost is missing.
- **Totals:**
  - `support` = every product's support.
  - The after-support totals use only costed products: `knownNet − cogs + costedSupport`, divided by `knownNet`.
- **Inactive PS book:** the line still shows `inactive` with no price, but its support counts.

**UI:**
- The metric `Gross margin` is renamed `Gross margin on sales`.
- New metrics: `Support` and `Gross margin after support`.
- Product table columns: rename `Gross margin %` to `Gross margin on sales %`; add `Support` and `Gross margin after support %` after it; the totals row covers both.
- Comparison table: a `Support` column after `Variance`, and a `Support to claim` metric.
- Comparison footnote adds: "Support is the Support entered on PS price books: ₱ per unit × quantity, or % of actual net sales. Lines sold at ₱0 earn no support."

- [ ] **Step 1: Write the failing unit tests** in `price-match.test.ts`, using a local PS000015 book whose entry `4800000600016` has a support:
  - `'PS sales earn Support per unit'`: amount 100; row qty 2, net 5590 → line `support === 200`, product line `support === 200`, `comparison.support === 200`.
  - `'percent Support is taken from actual net sales'`: 5% of 5590 → `279.5`.
  - `'₱0 sales lines earn no support'`.
  - `'support still counts when the PS book is inactive'`: status `'inactive'`, `support === 200`.
  - `'PL books never add support'`: a PL book entry carrying a stray `support` gives `match.support === null`.
  - `'after-support totals cover products with known cost'`. Two products, one missing cost, both with support:
    - `totals.support` sums both.
    - `totals.grossProfitAfterSupport` = `knownNet − cogs + supportOfCostedProduct`.
    - The missing-cost product's `grossMarginAfterSupportPercent === null`.
- [ ] **Step 2: Run** `npm test -w frontend`. Expected: FAIL.
- [ ] **Step 3: Implement** the domain changes, then the template changes.
- [ ] **Step 4: Write the e2e test** `'Support entered on a PS book shows in the calculator'` in `e2e/calculator-insights.spec.ts`:
  - As the product team, upload the sample price book through `Import ZenPOS price book files`.
  - Edit PS000015 and set `Support for 4800000600016` to `100`. Save.
  - Sign out and sign in as Accounting. Upload the sample sales export, the same way the existing tests in that file do.
  - The `Support to claim` metric shows `₱200.00`.
  - The `Gross margin by product` row for `4800000600016` shows `₱200.00`.
- [ ] **Step 5: Run** `npm test -w frontend`, `npm run build -w frontend` and `npx playwright test e2e/calculator-insights.spec.ts`. Expected: all pass. Fix existing assertions that read the old `Gross margin` labels.
- [ ] **Step 6: Commit** `feat: add PS Support to the calculator`.

---

### Task 9: README and full verification

**Files:**
- Modify: `README.md`, in the sections describing price books, Price IDs and the sales-export import.

- [ ] **Step 1: Update `README.md`:**
  - The ZenPOS Price Book import: one file per book, several files at once, the re-upload rules, and the storage limit of about 8–9 books the size of a 1,400-product PL.
  - PL/PS/PI meanings.
  - Support (₱ or % per product, PS only).
  - Margin on cost vs gross margin on sales.
  - The calculator's Support columns.
  - Remove the sales-export import description.
- [ ] **Step 2: Run** `npm test`, `npm run build` and `npx playwright test`. Expected: all pass. Paste the summary lines into the task report.
- [ ] **Step 3: Manual check.** Import the five real samples from `example output of Zenpos Price book/` through the running app (`npm start`, product team account), then confirm:
  - PL000013 has 1,419 products.
  - PS000005, PS000008 and PS000010 each have 67.
  - PI000005 has 25.
  - A WF-1000XM5 row shows `-5.88%` margin on cost.
  - Do not commit the samples.
- [ ] **Step 4: Commit** `docs: describe ZenPOS price book import and Support`.
