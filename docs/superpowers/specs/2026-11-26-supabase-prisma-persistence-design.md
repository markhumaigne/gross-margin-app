# Supabase + Prisma Persistence for Accounts and Products — Design

Date: 2026-11-26 · Branch: `feature/supabase-prisma` · Status: requested by the user; schema awaiting approval

## Intent

Connect the app to the user's Supabase Postgres database using Prisma. Only **user accounts** and
**product data (the product catalog and price books)** go in the database. The Sales Report
workflow stays as it is: uploaded sales reports, calculation results and the Excel report are never
saved. Accounting downloads the report, and that download is the only copy.

## How the app works today

- npm workspaces: `backend` (NestJS 11, CommonJS, run with ts-node; tsconfig rootDir is `..` and it
  includes `../shared`) and `frontend` (Angular 21 standalone components and signals). The Angular
  dev server proxies `/api` to 127.0.0.1:3000 (port 3100 for e2e). There is no database.
- Accounts are mock and live only in the browser. `core/user-accounts.service.ts` keeps users in a
  signal seeded from `mock-data/users.ts`, with plaintext passwords. `core/auth.service.ts` signs in
  on the client with `authenticate()` and keeps the user id in memory. Rules
  (`domain/user-accounts.ts`, `domain/roles.ts`): roles admin, accounting-head and product-team;
  exactly one Accounting Head, changed only through Transfer; always at least one active Admin;
  Admins can't demote or deactivate themselves; usernames are 3–32 characters from `[a-z0-9._-]`
  and unique regardless of case; passwords are at least 8 characters; inactive accounts can't sign in.
- Product data lives only in the browser: `core/pricing-workspace.service.ts` saves one
  `{ version: 1, books, products }` snapshot to localStorage key `ledger.pricing.v1`, seeded from
  `mock-data/price-books.ts` and `mock-data/products.ts`. `core/price-book.service.ts` reloads,
  calls a pure domain function, commits, and returns a synchronous `Result<T>`. ZenPOS price book
  files are parsed in the browser (`domain/zenpos-price-book.ts`) and merged by
  `applyZenposPriceBook` (`domain/price-book-import.ts`).
- The calculator stores nothing. `/api/excel/preview`, `/calculate` and `/export` read uploads with
  multer memoryStorage, and the export is signed with an HMAC key held in memory. Price book Support
  reaches the backend because the dashboard sends `supportList(books)` with Calculate. Sections
  05/06 (`components/product-insights`) read price books in the browser.

## Scope

Save in the database:

- User accounts, with hashed passwords only.
- The product catalog (`Product`) and price books with every entry field, including manual or
  ZenPOS product details and Support.

Never save in the database, and never log row contents:

- Uploaded Sales Reports, parsed sales rows, calculation results, Needs Review rows, the generated
  Excel workbook, or sections 05/06.
- Uploaded ZenPOS price book files. Only the parsed price book that the import produces is saved.
- The bank-rate configuration. It stays as it is today: JSON defaults, edits that last only for the
  session, and Excel import/export.

## Requirements

### Database (Supabase + Prisma)

- Prisma in the backend workspace; Prisma 7 puts the connection URL in `prisma.config.ts`, needs the
  `@prisma/adapter-pg` driver adapter, and doesn't load `.env` by itself. The generated client must
  load under ts-node and in `npm run build` / `start:prod`.
- Runtime uses Supabase's pooled connection string (transaction pooler, port 6543); the Prisma CLI
  and migrations use the direct or session connection (port 5432). Both come from environment
  variables; `backend/.env.example` holds placeholders. The user fills in `backend/.env`. Never ask
  for credentials in chat, never commit them.
- Tables live in `public`, which the Supabase Data API exposes: a migration enables Row Level
  Security on every table with no policies. Prisma connects as the table owner and isn't affected.
- Models: `User`, `Product`, `PriceBook`, `PriceBookEntry` (fields below in Decisions). One Accounting
  Head enforced by a partial unique index as well as in code. Money `Decimal(12,2)`; calendar dates
  `@db.Date`. The API returns the shapes the frontend types use today (numbers with ≤ 2 decimals,
  `YYYY-MM-DD` strings formatted in UTC).
- A seed script creates admin/Admin123!, accounting/Accounting123!, productteam/Product123! (hashed)
  and the demo catalog and price books. Existing localStorage price books are not migrated.

### Backend

- A `PrismaService` provider; `npm test` (calculator tests) still runs without a database.
- Auth: `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`; bcrypt or argon2; signed
  session token with the secret from env; a guard checking role permissions on the server with the
  same table as `roles.ts`.
- Accounts (Admin only): list, add, change role, activate/deactivate, transfer Accounting Head. Each
  change in a transaction, same rules and same error messages as `user-accounts.ts`.
- Products and price books: list catalog; list/get price books (readable with `price-books` OR
  `calculator`); create, update, duplicate, activate/deactivate, delete, import a parsed ZenPOS book
  (writes need `price-books`). zod request validation. Reuse the existing rules by moving the pure
  modules into `shared/`. Each write is one transaction against current database state, so two
  people saving at once can't overwrite each other's changes.
- Existing `/api/excel/*` and `/api/config/*` require a signed-in user with `calculator`; their
  request/response shapes and all calculation, parsing and export logic are unchanged.

### Frontend

- `AuthService` signs in through the API, keeps the token in memory only (a refresh still signs
  out), sends it with an HttpInterceptor, signs out on 401. The login page stops importing
  `SEED_USERS`.
- `UserAccountsService`, `PricingWorkspaceService`, `PriceBookService`, `ProductCatalogService` use
  the API. The `users`, `books` and `products` signals stay; methods return `Promise<Result<T>>`.
  Client-side validation stays for instant feedback.
- localStorage code is removed (`domain/pricing-storage.ts`, the `storage` listener, "browser storage
  full" messages). Price books are refetched when the window regains focus.
- The calculator flow is unchanged: upload → configure → calculate → download stays in memory.

### Tests and docs

- `npm test` and `npm run build` pass. e2e uses a separate test database from an env var (never real
  data), reset and seeded before the run; tests that assumed in-memory or localStorage state are
  updated. README covers setup and what is and isn't saved.

### Done when

- Accounts and price books survive a backend restart and a browser refresh (after signing in again).
- A sales report can be uploaded, calculated and downloaded without writing anything to the database.
- `npm test`, `npm run build` and the e2e suite pass.

## Decisions made during planning

1. **Prisma 7.10.1** (latest stable; 8.0 is still a release candidate). Generator `prisma-client`
   with `moduleFormat = "cjs"` and `importFileExtension = ""`: verified that the default `.ts`
   import extensions break the compiled `node dist/...` build, and that these settings work under
   both ts-node and tsc with the backend's `module: commonjs` / `moduleResolution: node`.
   `migrate reset` in Prisma 7 no longer seeds; seeding is an explicit script.
2. **Auth is the app's own (username + bcrypt hash + HS256 token), not Supabase Auth.** The app signs
   in by username (`admin`), Supabase Auth signs in by email, and the user asked for Prisma. So
   `@supabase/server`, `@supabase/supabase-js` and the Supabase API keys (`SUPABASE_URL`,
   publishable/secret keys, JWKS URL) are not used; only the Postgres connection strings are.
   Libraries: `bcryptjs` 3 (pure JS, no native build on Windows; cost 12 ≈ 170 ms) and
   `jsonwebtoken`. Tokens expire after 12 hours; logout is client-side (tokens are stateless).
3. **Writes serialize on a Postgres advisory transaction lock** (users: 41001, pricing: 41002), load
   the current state, run the existing pure domain function, and write only what changed. Editing a
   price book that someone else saved after it was opened is refused with 409
   (`expectedUpdatedAt` check) instead of silently overwriting their changes.
4. **Test database = a `test` schema in the same Supabase project** (user's choice, 2026-11-26).
   `TEST_DATABASE_URL` / `TEST_DIRECT_URL` are the real URLs plus `schema=test`; the Prisma pg adapter
   takes it as its `schema` option (verified in `@prisma/adapter-pg` 7.10.1 types). Test setup only
   runs `migrate deploy` (never `reset`), test data is cleared only through schema-qualified Prisma
   queries (never raw SQL), and scripts refuse URLs without a non-`public` schema or equal to the real
   ones. Every e2e test starts from freshly seeded data, as it did with in-memory state.
5. **Migrations** are generated with `prisma migrate diff` and applied with `prisma migrate deploy`
   (no shadow database needed on Supabase). CHECK constraints, expression/partial unique indexes and
   RLS are hand-written SQL appended to the generated migration.
6. **`domain/user-accounts.ts` loses the plaintext `password` field** on `UserAccount`; the seed type
   adds it back for hashing only. Sign-in messages stay identical.

## Change 2026-11-26: product catalog removed

The user works only from ZenPOS: price books come from ZenPOS price book imports (each row already
carries its own product details) or manual entry, and the calculator reads the ZenPOS Sales Report.
After the user deleted the `products` table from the real database, `GET /api/pricing` and imports
failed with P2021 because the app still read it. Decision: remove the catalog from the app entirely.

- The `Product` model, the `Product` type, catalog search and `ProductCatalogService` are gone. The
  table is dropped by the new migration `20261126130000_drop_products`
  (`DROP TABLE IF EXISTS "products"`); the applied migrations are unchanged.
- Every price book entry carries its own product details (`manual` is required in `shared/domain`).
  Reading an entry whose `manual_*` columns are empty fails with an error naming the book and the
  product instead of inventing details. `price_book_entries` keeps its columns.
- `PricingSnapshot` (and `GET /api/pricing`) is `{ books }`. Add products opens manual entry
  directly; catalog-only validation (promotional price vs. the catalog master list price) is gone,
  and so are the editor's Updated Selling Price / Promotional Price columns (only catalog rows used
  them; every row now shows its own details, margins and Support).
- The demo price books carry the former demo catalog's details for their products, with
  `updatedPrice` = net price and `promoPrice` = null, so the prices the tests compare stay the same.
