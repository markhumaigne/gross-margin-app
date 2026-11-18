# Click-to-Edit Products Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Clicking a product row in a viewed price book opens edit mode focused on that row. The row's side **Edit** opens a window with all of the row's info, including dates and memo.

**Architecture:** Angular only. The editor component navigates to `/price-books/:id/edit`, passing the product in `history.state.focusProduct`, then scrolls to and focuses that row after load. The product picker gains date and memo fields and emits them with `manualAdd`.

**Tech Stack:** Angular 21 signals, Playwright e2e.

**Spec:** `docs/superpowers/specs/2026-11-18-click-to-edit-products-design.md`

## Global Constraints
- No domain, storage or calculator changes.
- Labels, exactly: `Effective start`, `Effective end`, `Memo` in the product window.
- Commands:
  - `npm test -w frontend`
  - `npm run build -w frontend`
  - `npx playwright test e2e/manual-products.spec.ts e2e/price-books.spec.ts`

## Review Focus
1. Clicking a row in **edit** mode must do nothing extra: no navigation, and typing in the row's inputs still works.
2. Cancel after a row click must leave the saved book unchanged.
3. Catalog-linked demo rows: a row click still opens edit mode, but they get no Edit button.

---

### Task 1: Row click opens edit mode focused on the product

**Files:** `frontend/src/app/pages/price-books/price-book-editor.component.ts/.html`, `frontend/src/styles.scss`, `e2e/manual-products.spec.ts`

**Interfaces:** Produces the editor method `openRow(productId: string): void`. It runs only in view mode, navigating to `['/price-books', id, 'edit']` with `state: { focusProduct: productId }`.

- [ ] **Step 1: Write the failing e2e** `'clicking a product while viewing opens it in edit mode'`:
  1. Product Team views PL000013 and clicks the row containing `4800000100011`.
  2. URL matches `/price-books/PL000013/edit`.
  3. `Updated selling price for 4800000100011` is focused.
  4. Fill it with `5,000.00`, then Cancel (accept the dialog). The view still shows `₱5,595.00` for that row.
- [ ] **Step 2: Run** it. Expected: FAIL.
- [ ] **Step 3: Implement:**
  - In view mode, rows get class `clickable-row`, `tabindex="0"`, `(click)` and `(keydown.enter)` → `openRow`.
  - After `load()` in edit mode, if `history.state.focusProduct` is set, wait one render, scroll that row into view, then focus the first `input` in it. Rows carry `[attr.data-product]`.
- [ ] **Step 4: Run** the e2e. Expected: PASS.
- [ ] **Step 5: Commit** `feat: click a product to edit its price book`.

### Task 2: Edit window carries all of the row's info

**Files:** `frontend/src/app/pages/price-books/product-picker.component.ts/.html`, `price-book-editor.component.ts/.html`, `e2e/manual-products.spec.ts`

**Interfaces:**
- Picker: `@Input() defaultDates: { effectiveStart: string; effectiveEnd: string }`.
- `manualAdd` emits `{ productId, manual, support?, effectiveStart, effectiveEnd, memo }`.
- The editor's `saveManualProduct` stores all of them on the entry.

- [ ] **Step 1: Write the failing e2e** `'the side Edit changes every field of an imported product'`:
  1. Import the sample price book.
  2. Click the `4800000600016` row (opens edit mode).
  3. Click `Edit product 4800000600016`. The window shows `Effective start` = `2026-11-01`.
  4. Set Net Price `2500`, Support `100`, Effective end `2026-11-20`, Memo `Sony claim`, then Save product.
  5. Save price book. The view row shows `₱2,500.00`, `₱100.00`, `Nov 20, 2026` and `Sony claim`.
- [ ] **Step 2: Run** it. Expected: FAIL (no `Effective start` field).
- [ ] **Step 3: Implement:**
  - The picker shows `Effective start` / `Effective end` (date inputs) and `Memo` (text) after the product fields.
  - It prefills them from `initialEntry`, else from `defaultDates`, else blank.
  - The editor passes `defaultDates` from the draft book dates.
- [ ] **Step 4: Run** `npm run build -w frontend` and the two e2e specs. Expected: PASS.
- [ ] **Step 5: Commit** `feat: edit dates and memo in the product window`. Update the README's price books paragraph in the same commit.
