# Price ID and Supplier Support Columns Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** The calculated report (screen and Excel Sheet 1) gains **Price ID** and **Supplier Support** columns. GrossMargin adds Supplier Support from PS price books.

**Architecture:**
- The browser sends `priceSupport: { priceId, productId, support }[]` (PS entries with Support) inside the existing `options` JSON on `/api/excel/calculate`.
- The server reads an optional `priceId` column and computes `supplierSupport` per item. It adds that to `grossMargin` and allocates it into the bank summary so reconciliation still holds.
- `ITEM_COLUMNS` drives both the table and Sheet 1.

**Tech Stack:** NestJS + zod + Decimal.js (backend), Angular (frontend), ts-node tests, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-18-supplier-support-columns-design.md`

## Global Constraints
- **Column order, exactly:** `Product ID, Sales Date, Branch, Invoice Number, Product Name, Price ID, Quantity, Price, Cost, Supplier Support, Discount, Line Total, Payment, Applied Bank Rate, Bank Charges / Subsidy, GrossMargin, Sales Source Row, Tender, Calculation Explanation` (19 columns).
- **Supplier Support** = support × quantity, rounded HALF_UP to 2 decimals. It applies only when the sale's Price ID starts with `PS` and the list has that Price ID + Product ID (matched case-insensitively after trimming). Rows with a net Line Total ≤ 0, or a quantity that isn't positive, get `null`.
- **GrossMargin** = line − totalCost − adjustment + supplierSupport. When GrossMargin would be null, it stays null.
- **Sheet 1 column letters move:**
  - Old F–H become G–I; Supplier Support is J.
  - Old I–Q become K–S; Explanation is column 19.
- Commands: `npm test` (backend + frontend), `npm run build`, `npx playwright test`, and the real-report check `npx ts-node --project backend/tsconfig.json backend/test/sample.ts --sales <file>`.

## Review Focus
1. **Bank summary reconciliation** (`Bank summary failed financial reconciliation.`) must hold when items have support. Allocate the support across payment parts with the same weights as cost.
2. **Split-invoice rows:** support is per item, never repeated across an invoice's rows.
3. **No support list** (old clients) or **no Price ID column** gives blank Price ID and null Supplier Support, and the results are identical to today's.

---

### Task 1: Server computes Price ID and Supplier Support

**Files:**
- `shared/models.ts`
- `backend/src/excel/excel.service.ts`
- `backend/src/calculation/calculation.service.ts`
- `backend/src/excel/excel.controller.ts`
- `backend/src/excel/excel-export.service.ts`
- `backend/test/run.ts`

**Interfaces:**
- Produces `Sale.priceId: string`.
- Produces `ItemResult.priceId: string` and `ItemResult.supplierSupport: string | null`.
- Produces `export interface PriceSupport { priceId: string; productId: string; support: string }` (support is a money string) in `shared/models.ts`.
- `CalculationService.calculate(sales, configuration, priceSupport: PriceSupport[] = [])`.
- `FIELDS.priceId = ['Price ID', 'Price Book ID', 'Price List ID', 'Price List']`.
- The controller accepts optional `priceSupport` (zod: an array of at most 100,000 entries; each priceId ≤ 20 characters, productId ≤ 100, support a non-negative money string with up to 2 decimals).

- [ ] **Step 1: Write the failing tests** in `backend/test/run.ts`:
  - **`'PS Supplier Support adds to GrossMargin and Sheet 1'`.** Use a sale with Price ID `ps000015`, product `H-1`, qty 2, net 5590, unit cost 1960 and a BDO STRAIGHT card payment, with priceSupport `[{ priceId: 'PS000015', productId: 'h-1', support: '500' }]`. Expect:
    - `supplierSupport === '1000.00'`
    - `grossMargin === line − 3920 − fee + 1000`
    - the explanation contains `supplier support (PS000015: ₱500.00 × 2)`
    - the summary `grossMargin` includes it
    - Sheet 1 has 19 columns, F2 = `PS000015`, J2 = 1000
  - **`'Supplier Support is only for PS Price IDs and positive sales'`.** PL000013 with the same list entry gives `null`. Net 0 gives `null`. No list gives `null`, and GrossMargin is unchanged.
- [ ] **Step 2: Run** `npm test -w backend`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Read `priceId` like the other fields.
  - Build a lookup keyed `PRICEID|PRODUCTID`.
  - Set `supplierSupport` on item creation.
  - In `process`, add it to `grossMargin` and to the explanation.
  - Add it to the bank summary `grossMargin` with `allocate(support, costWeights)`.
  - Add the two columns to `ITEM_COLUMNS`.
  - Export notes use `ws.getColumn(key)`, not fixed `H1`/`J1`.
- [ ] **Step 4: Update** the existing backend tests for the new Sheet 1 letters and the 19-column count, then run `npm test -w backend`. Expected: all pass.
- [ ] **Step 5: Commit** `feat: add Price ID and Supplier Support to the calculated report`.

### Task 2: Browser sends PS Support and shows the columns

**Files:**
- `frontend/src/app/services/excel-api.service.ts`
- `frontend/src/app/components/dashboard/dashboard.component.ts`
- `frontend/src/app/components/excel-upload/excel-upload.component.ts`
- `frontend/src/app/domain/price-books.ts`
- `frontend/test/price-books.test.ts`
- `e2e/workflow.spec.ts`
- `e2e/calculator-insights.spec.ts`

**Interfaces:**
- Produces `supportList(books: readonly PriceBook[]): PriceSupport[]` in `domain/price-books.ts`. It covers PS books, active or not, and entries with Support defined, formatted `toFixed(2)`.
- `ExcelApiService.calculate(sales, configuration, priceSupport)`.

- [ ] **Step 1: Write the failing tests:**
  - Unit `'support list holds PS entries with Support only'`.
  - e2e in `calculator-insights.spec.ts`, `'Supplier Support from a PS book shows in the calculated report'`:
    1. Import the sample price book and set Support for `4800000600016` to `100`.
    2. Sign in as Accounting, calculate the sample export, and search `4800000600016`.
    3. The row shows Price ID `PS000015` and Supplier Support `₱200.00`.
- [ ] **Step 2: Run** and confirm both FAIL.
- [ ] **Step 3: Implement** the support list and the API parameter. The dashboard passes the list from `PriceBookService.books()`. The upload mapping offers `priceId`, labelled `Price ID (optional)`.
- [ ] **Step 4: Update** the existing e2e column positions and counts (19 columns; shifts as in Global Constraints). Run `npm run build`, `npm test` and `npx playwright test`. Expected: all pass.
- [ ] **Step 5: Run** the real-report check on the Nov 1–17 file and a one-day file. Expected: PASS. Update README (19 columns, Supplier Support), then commit `feat: send PS Support to the calculator and show the new columns`.
