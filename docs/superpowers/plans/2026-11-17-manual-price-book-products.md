# Manual Price Book Products Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement the tasks in this session.

**Goal:** Manually enter and retain every requested product field in price books.

**Architecture:** Optional manual detail snapshots on entries; a manual form in the existing product picker; edit manual entries through the same dialog. Preserve catalog behavior and resolve manual Net Price through existing updatedPrice lookups.

**Tech Stack:** Angular, TypeScript, existing domain test harness, Playwright.

**Spec:** docs/superpowers/specs/2026-11-17-manual-price-book-products-design.md

## Constraints and review focus

- Keep changes in the user's running checkout. No new dependencies or catalog mutations.
- Preserve leading zeros in IDs, zero amounts, negative margins, blank upper quantity bounds, and decimal quantities.
- Reject duplicate IDs (including surrounding whitespace/case differences), malformed amounts, and reversed quantity bounds.
- Save/edit/duplicate must retain all fields and avoid shared nested objects.
- Catalog prices, imports, and existing date validation must still work.
- The dialog must fit small screens, show errors, support keyboard focus, and discard canceled edits.

## Task 1: Domain storage and validation

- [x] Add failing tests in frontend/test/price-books.test.ts for manual entries without catalog products, round trips, validation, duplicate independence, and price matching.
- [x] Run npm run test -w frontend and confirm the missing-feature failure.
- [x] Add manual-product field types, validation, and serialization in frontend/src/app/domain/manual-products.ts; connect optional manual details in pricing.ts and price-books.ts.
- [x] Run npm run test -w frontend; all checks pass.

## Task 2: Manual entry, display, and editing

- [x] Add e2e/manual-products.spec.ts covering manual add/save/edit/cancel/duplicate/remove, validation, and mobile layout. Update catalog tests to select the catalog tab.
- [x] Add manual form and catalog tab in product-picker.component.*, and connect manual add/edit in price-book-editor.component.*. Extend styles.scss with responsive form styles.
- [x] Run npm test, npm run build, and npm run test:e2e. Inspect output and review the diff before reporting completion.

## Verification record

- Domain tests first failed because unknown products were rejected and manual values were discarded; passing after implementation.
- Browser test first failed because Product ID had no manual input; passing after implementation.
- `npm test`: backend 77/77 and frontend 60/60 passed after the review fixes.
- `npm run build`: backend and Angular production builds passed. Angular required process permission for its worker.
- Final `npm run test:e2e`: 42 passed, 1 existing fixture-dependent test skipped, including the new reserved-ID regression.
- Inspected desktop (1440 × 1000) and mobile (390 × 844) screenshots of the running app. Dialog fields scroll on mobile and its actions remain visible.
- Independent code review found prototype-key Product IDs could break error lookup and small decimal quantities could fail after reopening. Reproduced both with failing tests, then used prototype-free error dictionaries and accepted valid numeric exponent notation in quantity validation.
- Scope: quantity bounds are stored as entered; existing sales matching still uses the product's entered Net Price. Storage retains the existing session-only lifecycle.
