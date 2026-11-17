# Price Book Management + Mock RBAC — Design

Date: 2026-11-17 · Branch: `test` · Status: approved by the user

## Intent

A frontend-only demonstration of an original Price Book module, a Sales Report by Product
module and mock role-based access, integrated into the existing "ledger." Angular application.
Reference screenshots (a third-party POS) guide functional layout only — no branding, names,
code or data are copied. Everything is in-memory mock data designed to be replaced later by a
real backend.

## Goals

- Mock login with three hardcoded development accounts (admin / accounting / productteam).
- Role-based navigation, route guards and permission checks.
- Admin manages mock accounts and roles; exactly one Accounting Head at all times.
- Product Team (and Admin) create, edit, duplicate, activate/deactivate and view Price Books,
  search/select products, and enter updated and promotional prices with validity dates.
- Admin and Accounting Head upload CSV/Excel sales files, preview, validate, match Product IDs and
  see quantity, revenue, COGS, gross profit and gross margin % per product.
- Existing Bank Rate Calculator keeps working, now behind sign-in.

## Non-goals / anti-goals

- No database, API endpoints, migrations, backend auth or external services for new modules.
- No persistence: refreshing the browser signs out and resets mock data (accepted).
- Not production authentication. Passwords are plaintext mock constants.
- Never overwrite Master List Price with updated or promo prices.
- Never silently substitute current mock cost for missing historical cost.
- No ZenPOS branding, colours, wording or data. No real customer/employee information.

## Existing application (as found)

- Angular 21 standalone components with signals, Angular Material (button, progress-bar, tabs),
  global `styles.scss` (navy sidebar `#112740`, Segoe UI, compact 9–13px type, `.section-card`,
  `.section-heading`, `.metrics-grid`, `.table-scroll`, `.search-label`, `.status-pill`, etc.).
- `DashboardComponent` is the root and contains the shell (sidebar + topbar) and the calculator.
- No router, no login. NestJS backend serves calculator APIs only.
- Tests: backend ts-node runner (`backend/test/run.ts`), Playwright e2e (`e2e/workflow.spec.ts`)
  on ports 3100/4300 that opens `/` and expects the calculator.

## Approach (chosen)

Considered: (a) Angular Router with functional guards; (b) signal-based view switching inside the
dashboard; (c) separate app. (b) cannot provide real route guards or deep links and would bloat the
dashboard; (c) is ruled out by the user. **Chosen: (a)** — add `@angular/router` (same 21.x
version) and a shell layout component.

Excel parsing in the browser uses `xlsx` (already used by the backend, same tarball) via dynamic
`import()` so it only loads on the Sales Report page.

## Architecture

```
frontend/src/app/
  app.routes.ts                    routes + guards
  core/
    auth/                          roles.ts (pure), auth.service.ts, guards
    mock-data/                     users, products, price-books, sample-sales (pure data)
  layout/shell/                    sidebar + topbar + <router-outlet>, role-aware nav
  pages/
    login/
    price-books/                   list, editor (create/edit/view), product picker
    sales-report/                  upload, preview, validation, per-product results
    users/                         admin account + role management
    forbidden/
  domain/                          pure TS logic, no Angular imports (unit-testable)
    pricing.ts                     discount %, line status, validation
    price-book-store logic         create/update/duplicate/toggle helpers
    sales-report.ts                header detection, row validation, aggregation
    user-accounts.ts               role assignment rules (single Accounting Head)
frontend/test/run.ts               node:assert tests for domain/ via ts-node
```

- `DashboardComponent` keeps the calculator; its shell markup moves into `ShellComponent`. The
  calculator's in-page sub-links (Configuration settings, Calculation results) stay in the
  sidebar under the calculator entry when that page is active.
- Services hold state in signals (`AuthService`, `UserAccountsService`, `PriceBookService`,
  `ProductCatalogService`) seeded from `mock-data/` — the seam for a future backend.

## Roles and permissions

| Permission | Admin | Accounting Head | Product Team |
|---|---|---|---|
| Bank Rate Calculator | ✓ | ✓ | – |
| Sales Report by Product (upload/view) | ✓ | ✓ | – |
| Price Books (view/manage) | ✓ | – | ✓ |
| User accounts (manage) | ✓ | – | – |

- Accounts: `admin / Admin123!` (Admin), `accounting / Accounting123!` (Accounting Head),
  `productteam / Product123!` (Product Team).
- Route guards: unauthenticated → `/login` (with return URL); authenticated but lacking
  permission → `/forbidden`. Nav items hidden when not permitted. Mutating service methods also
  check permission.
- After login, redirect to return URL if permitted, else the role's home (Admin → Calculator;
  Accounting Head → Sales Report; Product Team → Price Books).
- Accounting Head rule: exactly one holder. Admin transfers the role by choosing a new holder
  and, in the same step, the role the outgoing holder receives. Changing the current holder's
  role away from Accounting Head without a successor is rejected; assigning Accounting Head to a
  second account is only possible through the transfer. Also: at least one active Admin must
  remain; the signed-in admin cannot remove their own Admin role or deactivate themselves.
- Admin can add mock accounts (username, display name, role, password), activate/deactivate, and
  change roles (subject to the rules above). Inactive accounts cannot sign in. Usernames unique.

## Price Books

Book fields: ID (auto `PB-0001`…), Name (required, unique case-insensitive), Description/Memo,
Effective Date (required), Expiration Date (optional, ≥ effective), Status Active/Inactive,
Last Updated (+ updated by), entries.

Entry fields: Product ID, Product Name, Unit, Master List Price (read-only from catalog, never
written), Cost (read-only), Updated Selling Price (optional), Promotional Price (optional),
Discount % (calculated), Effective Start, Effective End, Status (calculated), Memo.

Calculations:
- Effective price = Promotional Price if set, else Updated Selling Price, else Master List Price.
- Discount % = (Master − Effective) / Master × 100, rounded 2 dp; negative values shown as markup.
  Shown separately for promo vs master when both prices exist.
- Margin % shown in picker/editor = (Effective − Cost) / Effective × 100.
- Entry status from today (Asia/Manila calendar date): Scheduled if start > today; Expired if end
  < today; else Active. Book Inactive does not change entry status but book shows Inactive.

Validation: prices must be numbers > 0 with ≤ 2 decimals; promo price requires start and end
dates; promo must not exceed the price it discounts (updated price if set, else master) — error;
end ≥ start; entry window must fall inside the book's validity
when the book has an expiration date; duplicate products in one book rejected.

Screens:
- List: search (ID/name/memo), status filter, columns ID, Name, Memo, Products, Effective,
  Status pill, Last Updated, actions (View, Edit, Duplicate, Activate/Deactivate). Count footer.
- Editor (create/edit/view-only): header fields, products table with inline editing,
  Add Products (opens picker modal), Remove product, Save/Cancel. Unsaved changes are discarded
  on Cancel with confirmation.
- Product picker modal: keyword search by Product ID or name, table with Product ID, Name, Unit,
  On hand, Master List Price, Unit (selling) Price, Cost, Margin %, checkbox select, select all
  visible, already-added rows disabled, "Add N products".
- Duplicate: copies entries to a new book named "<name> (copy)", Inactive, new ID.

## Sales Report by Product

- Upload `.csv`, `.xlsx`, `.xls` (≤ 10 MB) parsed in the browser. Also "Load demo report" and
  "Download sample CSV" buttons using mock sample sales.
- Header detection (case/spacing-insensitive aliases, same family as the calculator): Product ID
  (Product ID, ProductID, SKU, Item Code, Product Code), Product Name, Quantity (Qty, Quantity),
  Net Sales (Net Total, Net Sales, Line Total, Amount, Total), Cost (Cost, Unit Cost → unit;
  Total Cost, Line Cost, COGS → line), Date (optional). User can override mappings and choose
  cost basis.
- Preview first 10 rows with detected headers and row count.
- Row validation: missing/unknown Product ID (unknown = not in mock catalog → excluded and listed),
  non-numeric or zero quantity, non-numeric net sales, negative quantity/sales (refund → listed
  for review and excluded), invalid cost.
- Cost source per row: "Report" when the file provides it; otherwise blank (COGS/GP/GM blank,
  row flagged "No historical cost"). Opt-in toggle "Use current mock cost as an estimate"
  fills those rows with catalog cost labelled "Estimate (current mock cost)".
- Aggregation per Product ID: quantity, net sales revenue, COGS, gross profit, GM %, cost source
  (Report / Estimate / Mixed / Missing). Products with any missing cost get GP/GM blank.
  Totals row and metrics: revenue, COGS, GP, GM % (known-cost products only, stated).
- GP = Net Sales − COGS; GM % = GP / Net Sales × 100 (blank when net sales is 0).
- Money math in integer centavos to avoid float drift; display PHP 2 dp.
- Banner: "Demonstration data — not financial records".

## Testing

- `frontend/test/run.ts` (node:assert, ts-node) covering pricing math/status/validation, role
  rules (single Accounting Head, last admin), permission matrix, sales parsing/validation/
  aggregation and price-book store operations.
- Playwright `e2e/rbac-price-book.spec.ts`: login failures, each role's access and blocked
  routes, admin role transfer, price book create/edit/duplicate/toggle, product selection,
  promo/updated pricing, invalid entries, sales upload (CSV fixture) and results.
- Existing `e2e/workflow.spec.ts` gains a sign-in helper; behaviour otherwise unchanged.
- `npm test`, `npm run build`, `npm run test:e2e` must pass.

## Left to the builder

Exact copy, spacing and icons within the existing visual language; mock product list contents
(original, synthetic electronics SKUs); routing of the login redirect details.
