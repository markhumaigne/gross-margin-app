# Price Book Management + Mock RBAC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add mock sign-in with three roles, route guards, an original Price Book module, an admin
user-accounts page and a frontend-only Sales Report by Product to the existing "ledger." Angular app.

**Architecture:** Pure TypeScript domain logic and mock data (no Angular imports) under
`frontend/src/app/domain` and `frontend/src/app/mock-data`, unit-tested with node:assert via ts-node.
Thin signal-based Angular services wrap the domain functions. `@angular/router` adds routes and
functional guards; the existing sidebar/topbar move into a `ShellComponent` and the existing
calculator becomes the `/calculator` route.

**Tech Stack:** Angular 21.2 standalone + signals, Angular Router 21.2.25, Angular Material (existing),
global SCSS (existing), SheetJS `xlsx` 0.20.3 (browser parsing), ts-node + node:assert, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-17-price-book-design.md`

## Global Constraints

- Work only on branch `test`. Commit after every task.
- Frontend only for new features: no new backend endpoints, database, migrations, backend auth,
  external services, localStorage, sessionStorage or cookies. Do not modify `backend/`.
- New dependencies only: `@angular/router@21.2.25` (must equal installed `@angular/core` 21.2.25) and
  `xlsx` from `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`, both in `frontend/package.json`.
- Files in `frontend/src/app/domain/` and `frontend/src/app/mock-data/` must not import `@angular/*`
  or use `window`/`document` (they run under ts-node). `domain/read-spreadsheet.ts` may use `File`.
- Money in models: peso `number` with ≤ 2 decimals. All arithmetic in integer centavos via
  `domain/money.ts`. Display with `currency: 'PHP' : 'symbol' : '1.2-2'`. Percentages rounded half
  away from zero to 2 dp.
- Dates are `YYYY-MM-DD` strings; "today" is the Asia/Manila calendar date (`todayInManila()`).
- Accounts exactly: `admin` / `Admin123!` / Admin; `accounting` / `Accounting123!` / Accounting Head;
  `productteam` / `Product123!` / Product Team. Role labels exactly `Admin`, `Accounting Head`,
  `Product Team`.
- Access matrix: calculator → Admin, Accounting Head; sales-report → Admin, Accounting Head;
  price-books → Admin, Product Team; users → Admin.
- Never store or write a master list price on a price-book entry; entries reference catalog products
  by `productId` and read `masterListPrice` from the catalog.
- Never silently substitute current mock cost for missing historical cost.
- Visual language: reuse existing global classes in `frontend/src/styles.scss` (`.section-card`,
  `.section-heading`, `.section-number`, `.page-heading`, `.eyebrow`, `.metrics-grid`, `.metric`,
  `.table-scroll`, `.search-label`, `.status-pill`, `.status-pill.warning`, `.notice`,
  `.error-message`, `.page-alert`, `.empty-state`, `.pagination`, `.numeric`, `mat-flat-button`,
  `mat-stroked-button`, `mat-button`). Append new CSS at the end of `styles.scss` under a
  `/* ---- Price books, accounts and access control ---- */` comment. Navy/blue palette only; no
  ZenPOS names, logos, colours or wording.
- At 390 px viewport width there must be no horizontal page scroll
  (`document.documentElement.scrollWidth <= window.innerWidth`); wide tables scroll inside
  `.table-scroll`.
- Format changed files with `npx prettier --write <files>` (repo `.prettierrc.json`); do not reformat
  untouched files.

## Review Focus

1. Prices typed with a peso sign, commas or too many decimals (`₱1,299.50`, `99.999`) — accept the
   first as 1299.50, reject the second with the positive-amount message. Pinned in Task 1 and Task 3.
2. Product IDs in uploads with spaces, different case or stored as Excel numbers
   (` 4800000100011 `, `4800000100011` numeric, CSV `0012`) — matched/kept exactly, no exponent, no lost
   leading zeros. Pinned in Task 5.
3. A product whose rows are only partly costed — COGS, gross profit and margin blank for that product
   (never a partial COGS), and excluded from cost totals. Pinned in Task 5.
4. Admin removing the last Admin (self-demotion, self-deactivation, transferring Accounting Head to the
   only Admin) — rejected with a message. Pinned in Task 2.
5. Signing in from a deep link the new user may not open (`/login?returnUrl=/sales-report` as Product
   Team) — land on the role's home, not `/forbidden`. Pinned in Task 1 (`pathPermission`) and Task 6.

---

### Task 1: Frontend test runner and core domain helpers

**Files:**
- Create: `frontend/test/harness.ts`, `frontend/test/run.ts`, `frontend/test/tsconfig.json`,
  `frontend/test/core.test.ts`
- Create: `frontend/src/app/domain/result.ts`, `money.ts`, `dates.ts`, `roles.ts`
- Modify: `frontend/package.json` (script `"test": "ts-node --project test/tsconfig.json test/run.ts"`),
  root `package.json` (`"test": "npm run test -w backend && npm run test -w frontend"`)

**Interfaces:**
- Produces:
  - `harness.ts`: `test(name: string, run: () => void | Promise<void>): void`,
    `runAll(): Promise<void>` (prints `PASS name` / `FAIL name`, then `N/M checks passed.`, sets
    `process.exitCode = 1` on failure — same output style as `backend/test/run.ts`).
  - `run.ts`: imports every `./*.test.ts` file, then `void runAll()`.
  - `tsconfig.json`: `module commonjs`, `moduleResolution node`, `target ES2022`, `strict`,
    `esModuleInterop`, `skipLibCheck`, `types: ["node"]`, include `./**/*.ts`,
    `../src/app/domain/**/*.ts`, `../src/app/mock-data/**/*.ts`.
  - `result.ts`: `type Result<T> = { ok: true; value: T } | { ok: false; error: string }`,
    `ok<T>(value: T): Result<T>`, `fail(error: string): { ok: false; error: string }`.
  - `money.ts`: `parseMoney(input: unknown): number | null` (pesos; accepts finite numbers and strings
    with optional `₱`/`PHP` prefix, comma groups, accounting parentheses → negative; float noise within
    1e-6 of a centavo is normalised; blank, text, `NaN`, `Infinity` and fractions of a centavo →
    `null`), `isBlank(input: unknown): boolean`, `toCents(pesos: number): number`,
    `fromCents(cents: number): number`, `percentOf(numeratorCents: number, denominatorCents: number):
    number | null` (null when denominator is 0; half away from zero, 2 dp).
  - `dates.ts`: `todayInManila(now?: Date): string`, `isIsoDate(value: string): boolean`.
  - `roles.ts`: `type Role = 'admin' | 'accounting-head' | 'product-team'`,
    `type Permission = 'calculator' | 'sales-report' | 'price-books' | 'users'`,
    `ROLE_LABELS: Record<Role, string>`, `ROLE_PERMISSIONS: Record<Role, readonly Permission[]>`,
    `hasPermission(role: Role | null | undefined, permission: Permission): boolean`,
    `homePath(role: Role): string` (`/calculator`, `/sales-report`, `/price-books` for admin,
    accounting-head, product-team), `pathPermission(url: string): Permission | null` (first path
    segment `calculator|sales-report|price-books|users` → that permission, else null; ignores query and
    fragment).

- [ ] **Step 1: Write the failing tests in `frontend/test/core.test.ts`**

```ts
test('parseMoney accepts plain, comma, peso-sign, PHP and parenthesised amounts', () => {
  assert.equal(parseMoney('1,299.50'), 1299.5);
  assert.equal(parseMoney('₱1,299.50'), 1299.5);
  assert.equal(parseMoney('PHP 899'), 899);
  assert.equal(parseMoney(5795), 5795);
  assert.equal(parseMoney('(150.00)'), -150);
  assert.equal(parseMoney(0.1 + 0.2), 0.3);
});
test('parseMoney rejects blanks, text and fractions of a centavo', () => {
  for (const v of ['', '   ', null, undefined, 'abc', '12.345', '99.999', '1,2x', NaN, Infinity])
    assert.equal(parseMoney(v), null, String(v));
});
test('percentOf rounds half away from zero to two decimals', () => {
  assert.equal(percentOf(1, 3), 33.33);
  assert.equal(percentOf(2, 3), 66.67);
  assert.equal(percentOf(1, 20000), 0.01);
  assert.equal(percentOf(-1, 20000), -0.01);
  assert.equal(percentOf(80000, 579500), 13.81);
  assert.equal(percentOf(1, 0), null);
});
test('todayInManila uses the Manila calendar date', () => {
  assert.equal(todayInManila(new Date('2026-11-16T16:30:00Z')), '2026-11-17');
  assert.equal(todayInManila(new Date('2026-11-17T15:59:00Z')), '2026-11-17');
});
test('isIsoDate accepts only real YYYY-MM-DD dates', () => {
  assert.equal(isIsoDate('2026-02-28'), true);
  for (const v of ['2026-02-30', '11/17/2026', '', '2026-1-01']) assert.equal(isIsoDate(v), false);
});
test('role permissions match the access matrix', () => {
  assert.deepEqual([...ROLE_PERMISSIONS.admin].sort(), ['calculator', 'price-books', 'sales-report', 'users']);
  assert.deepEqual([...ROLE_PERMISSIONS['accounting-head']].sort(), ['calculator', 'sales-report']);
  assert.deepEqual([...ROLE_PERMISSIONS['product-team']], ['price-books']);
  assert.equal(hasPermission(null, 'calculator'), false);
  assert.deepEqual(ROLE_LABELS, { admin: 'Admin', 'accounting-head': 'Accounting Head', 'product-team': 'Product Team' });
  assert.equal(homePath('accounting-head'), '/sales-report');
});
test('pathPermission maps URLs to the permission that guards them', () => {
  assert.equal(pathPermission('/sales-report?x=1'), 'sales-report');
  assert.equal(pathPermission('/price-books/PB-0001/edit'), 'price-books');
  assert.equal(pathPermission('/calculator#results'), 'calculator');
  assert.equal(pathPermission('/'), null);
  assert.equal(pathPermission('/forbidden'), null);
});
```

- [ ] **Step 2: Run `npm run test -w frontend`** — Expected: FAIL (modules not found).
- [ ] **Step 3: Implement the harness, runner, tsconfig, scripts and the four domain files** with the
  signatures above. `percentOf` must work in integers (e.g. `n * 10000 / d`, round magnitude, restore
  sign, `/100`) so `percentOf(1, 20000)` is exactly 0.01.
- [ ] **Step 4: Run `npm run test -w frontend`** — Expected: `7/7 checks passed.`
  Run `npm test` — Expected: backend checks and frontend checks both pass.
- [ ] **Step 5: Commit** `feat: add frontend domain test runner, money, dates and roles`

---

### Task 2: Mock user accounts and role-assignment rules

**Files:**
- Create: `frontend/src/app/domain/user-accounts.ts`, `frontend/src/app/mock-data/users.ts`,
  `frontend/test/user-accounts.test.ts` (import it from `run.ts`)

**Interfaces:**
- Consumes: `Result`, `ok`, `fail`, `Role`, `ROLE_LABELS` (Task 1).
- Produces:
  - `interface UserAccount { id: string; username: string; displayName: string; role: Role; active: boolean; password: string }`
  - `interface NewUserDraft { username: string; displayName: string; password: string; role: Role }`
  - `authenticate(users: readonly UserAccount[], username: string, password: string): Result<UserAccount>`
    (username trimmed + case-insensitive, password exact)
  - `accountingHead(users: readonly UserAccount[]): UserAccount | undefined`
  - `addUser(users, draft: NewUserDraft): Result<UserAccount[]>` (new id `u-<max+1>`, active true)
  - `changeRole(users, actorId: string, targetId: string, role: Role): Result<UserAccount[]>`
  - `transferAccountingHead(users, newHolderId: string, previousHolderRole: Exclude<Role, 'accounting-head'>): Result<UserAccount[]>`
  - `setUserActive(users, actorId: string, targetId: string, active: boolean): Result<UserAccount[]>`
  - All mutators return new arrays/objects and never mutate input.
  - `mock-data/users.ts`: `SEED_USERS: readonly UserAccount[]` — `u-1 admin 'Demo Admin'`,
    `u-2 accounting 'Demo Accountant'`, `u-3 productteam 'Demo Product Lead'`, credentials and roles
    from Global Constraints, all active.
- Exact error messages:
  - blank username or password: `Enter your username and password.`; unknown user or wrong password:
    `Invalid username or password.`; inactive: `This account is inactive. Contact an Admin.`
  - assigning `accounting-head` via `addUser`/`changeRole`:
    `Use "Transfer Accounting Head" to assign the Accounting Head role.`
  - changing the current head's role: `Transfer the Accounting Head role to another account before changing this role.`
  - actor demoting self from admin: `You cannot remove your own Admin role.`
  - any change leaving zero active admins: `At least one active Admin account is required.`
  - missing account: `Account not found.`; inactive new holder: `Inactive accounts cannot become Accounting Head.`;
    new holder already head: `<displayName> is already the Accounting Head.`
  - self-deactivation: `You cannot deactivate your own account.`; deactivating the head:
    `Transfer the Accounting Head role before deactivating this account.`
  - addUser: username must match `/^[a-z0-9._-]{3,32}$/i` else
    `Username must be 3–32 letters, numbers, dots, dashes or underscores.`; duplicate (case-insensitive):
    `Username "<username>" is already taken.`; blank display name: `Display name is required.`;
    password under 8 chars: `Password must be at least 8 characters.`

- [ ] **Step 1: Write the failing tests**

```ts
const heads = (u: readonly UserAccount[]) => u.filter((x) => x.role === 'accounting-head').length;
test('seed accounts match the development credentials', () => {
  assert.deepEqual(SEED_USERS.map((u) => [u.username, u.password, u.role]), [
    ['admin', 'Admin123!', 'admin'], ['accounting', 'Accounting123!', 'accounting-head'], ['productteam', 'Product123!', 'product-team']]);
  assert.equal(heads(SEED_USERS), 1);
});
test('authenticate checks username case-insensitively and password exactly', () => {
  assert.equal(expectOk(authenticate(SEED_USERS, ' ADMIN ', 'Admin123!')).id, 'u-1');
  assert.equal(expectFail(authenticate(SEED_USERS, 'admin', 'admin123!')), 'Invalid username or password.');
  assert.equal(expectFail(authenticate(SEED_USERS, 'nobody', 'x')), 'Invalid username or password.');
  assert.equal(expectFail(authenticate(SEED_USERS, '', '')), 'Enter your username and password.');
  const inactive = expectOk(setUserActive(SEED_USERS, 'u-1', 'u-3', false));
  assert.equal(expectFail(authenticate(inactive, 'productteam', 'Product123!')), 'This account is inactive. Contact an Admin.');
});
test('transferring Accounting Head keeps exactly one holder and reassigns the previous one', () => {
  const next = expectOk(transferAccountingHead(SEED_USERS, 'u-3', 'product-team'));
  assert.equal(next.find((u) => u.id === 'u-3')!.role, 'accounting-head');
  assert.equal(next.find((u) => u.id === 'u-2')!.role, 'product-team');
  assert.equal(heads(next), 1);
  assert.equal(SEED_USERS[2].role, 'product-team'); // input not mutated
});
test('Accounting Head cannot be duplicated or removed without a successor', () => {
  assert.match(expectFail(changeRole(SEED_USERS, 'u-1', 'u-3', 'accounting-head')), /Transfer Accounting Head/);
  assert.match(expectFail(changeRole(SEED_USERS, 'u-1', 'u-2', 'product-team')), /before changing this role/);
  assert.match(expectFail(addUser(SEED_USERS, { username: 'acct2', displayName: 'A', password: 'Password1', role: 'accounting-head' })), /Transfer Accounting Head/);
  assert.match(expectFail(setUserActive(SEED_USERS, 'u-1', 'u-2', false)), /before deactivating/);
  assert.match(expectFail(transferAccountingHead(SEED_USERS, 'u-2', 'admin')), /already the Accounting Head/);
});
test('the last active Admin is protected', () => {
  assert.equal(expectFail(changeRole(SEED_USERS, 'u-1', 'u-1', 'product-team')), 'You cannot remove your own Admin role.');
  assert.equal(expectFail(setUserActive(SEED_USERS, 'u-1', 'u-1', false)), 'You cannot deactivate your own account.');
  assert.equal(expectFail(transferAccountingHead(SEED_USERS, 'u-1', 'product-team')), 'At least one active Admin account is required.');
  const two = expectOk(addUser(SEED_USERS, { username: 'admin2', displayName: 'Second Admin', password: 'Password1', role: 'admin' }));
  assert.equal(expectOk(changeRole(two, 'u-4', 'u-1', 'product-team')).find((u) => u.id === 'u-1')!.role, 'product-team');
});
test('addUser validates username, display name and password', () => {
  const draft = { username: 'pricing.lead', displayName: 'Pricing Lead', password: 'Password1', role: 'product-team' as const };
  const added = expectOk(addUser(SEED_USERS, draft)).at(-1)!;
  assert.deepEqual([added.id, added.active], ['u-4', true]);
  assert.equal(expectFail(addUser(SEED_USERS, { ...draft, username: 'ADMIN' })), 'Username "ADMIN" is already taken.');
  assert.match(expectFail(addUser(SEED_USERS, { ...draft, username: 'a b' })), /3–32 letters/);
  assert.equal(expectFail(addUser(SEED_USERS, { ...draft, password: 'short' })), 'Password must be at least 8 characters.');
  assert.equal(expectFail(addUser(SEED_USERS, { ...draft, displayName: ' ' })), 'Display name is required.');
});
```
  Add `expectOk<T>(r: Result<T>): T` and `expectFail(r: Result<unknown>): string` to `harness.ts`.

- [ ] **Step 2: Run `npm run test -w frontend`** — Expected: FAIL (module not found).
- [ ] **Step 3: Implement `user-accounts.ts` and `mock-data/users.ts`.** Check order in `changeRole`:
  not found → target to accounting-head → target is head → self-demotion → last admin.
- [ ] **Step 4: Run `npm run test -w frontend`** — Expected: all checks pass.
- [ ] **Step 5: Commit** `feat: add mock user accounts with single Accounting Head rule`

---

### Task 3: Product catalog and price-entry calculations

**Files:**
- Create: `frontend/src/app/domain/pricing.ts`, `frontend/src/app/mock-data/products.ts`,
  `frontend/test/pricing.test.ts`

**Interfaces:**
- Consumes: `parseMoney`, `isBlank`, `toCents`, `percentOf` (Task 1), `isIsoDate`.
- Produces:
  - `interface Product { id: string; name: string; unit: string; onHand: number; masterListPrice: number; sellingPrice: number; cost: number }`
  - `type EntryStatus = 'Active' | 'Scheduled' | 'Expired'`
  - `interface PriceBookEntry { productId: string; updatedPrice: number | null; promoPrice: number | null; effectiveStart: string; effectiveEnd: string | null; memo: string }`
  - `interface PriceBookEntryDraft { productId: string; updatedPrice: string; promoPrice: string; effectiveStart: string; effectiveEnd: string; memo: string }`
  - `effectivePrice(product: Pick<Product, 'masterListPrice'>, entry: Pick<PriceBookEntry, 'updatedPrice' | 'promoPrice'>): number` — promo, else updated, else master.
  - `priceSource(entry: Pick<PriceBookEntry, 'updatedPrice' | 'promoPrice'>): 'promo' | 'updated' | 'master'`
  - `discountPercent(masterListPrice: number, price: number): number | null` — `(master − price) / master × 100`; null when master ≤ 0; negative = markup.
  - `marginPercent(price: number, cost: number): number | null` — `(price − cost) / price × 100`; null when price ≤ 0.
  - `entryStatus(entry: Pick<PriceBookEntry, 'effectiveStart' | 'effectiveEnd'>, today: string): EntryStatus` — start > today → Scheduled; end < today → Expired; else Active (both bounds inclusive).
  - `validateEntryDraft(draft: PriceBookEntryDraft, product: Product | undefined, book: { effectiveDate: string; expirationDate: string }): string[]`
  - `entryFromDraft(draft: PriceBookEntryDraft): PriceBookEntry` (blank → null; trims memo)
  - `entryToDraft(entry: PriceBookEntry): PriceBookEntryDraft` (numbers → `toFixed(2)` strings, null → `''`)
  - `searchProducts(products: readonly Product[], query: string): Product[]` — trimmed, case-insensitive substring on id or name; blank → all.
  - `mock-data/products.ts`: `PRODUCTS: readonly Product[]` — 20–26 original synthetic electronics items,
    unique 13-digit string IDs starting `4800`, generic names (no real brands), units `PCS`/`SET`/`BOX`.
    Must include exactly these (used by later tests):
    - `4800000100011` `24" IPS Monitor FHD 100Hz` PCS onHand 18, master 5795, selling 5795, cost 4681
    - `4800000100028` `27" Curved Gaming Monitor QHD 165Hz` PCS 7, master 15995, selling 14995, cost 12210
    - `4800000200014` `Wireless Keyboard and Mouse Combo` SET 42, master 1495, selling 1295, cost 820
    - `4800000300017` `15.6" Laptop Core i5 16GB 512GB SSD` PCS 5, master 45995, selling 43995, cost 38750
    - `4800000400010` `USB-C Docking Station 8-in-1` PCS 11, master 4950, selling 4950, cost 4952
- Validation messages, in this order (collect all that apply):
  - product undefined: `Product is not in the catalog.`
  - updated non-blank and (`parseMoney` null or ≤ 0): `Updated selling price must be a positive amount with up to 2 decimals.`
  - promo non-blank and invalid: `Promotional price must be a positive amount with up to 2 decimals.`
  - valid promo > valid updated: `Promotional price cannot exceed the updated selling price.`;
    else valid promo > master: `Promotional price cannot exceed the master list price.`
  - start not a valid date: `Effective start date is required.`
  - end non-blank and invalid: `Effective end must be a valid date.`
  - end < start: `Effective end cannot be before effective start.`
  - valid promo and blank end: `Promotional prices need an effective end date.`
  - valid start < valid book effective date: `Effective start cannot be before the price book effective date.`
  - valid book expiration and (end blank or end > expiration): `Effective end must be on or before the price book expiration date.`

- [ ] **Step 1: Write the failing tests**

```ts
const p1 = PRODUCTS.find((p) => p.id === '4800000100011')!;
const book = { effectiveDate: '2026-11-01', expirationDate: '2026-11-30' };
const draft = (o: Partial<PriceBookEntryDraft> = {}): PriceBookEntryDraft => ({
  productId: p1.id, updatedPrice: '', promoPrice: '', effectiveStart: '2026-11-01', effectiveEnd: '2026-11-30', memo: '', ...o });
test('effective price prefers promo, then updated, then master', () => {
  assert.equal(effectivePrice(p1, { updatedPrice: null, promoPrice: null }), 5795);
  assert.equal(effectivePrice(p1, { updatedPrice: 5495, promoPrice: null }), 5495);
  assert.equal(effectivePrice(p1, { updatedPrice: 5495, promoPrice: 4995 }), 4995);
  assert.equal(priceSource({ updatedPrice: 5495, promoPrice: null }), 'updated');
});
test('discount and margin percentages', () => {
  assert.equal(discountPercent(5795, 4995), 13.81);
  assert.equal(discountPercent(5795, 5495), 5.18);
  assert.equal(discountPercent(1000, 1100), -10);
  assert.equal(discountPercent(0, 10), null);
  assert.equal(marginPercent(6190, 4861), 21.47);
  assert.equal(marginPercent(4950, 4952), -0.04);
  assert.equal(marginPercent(0, 5), null);
});
test('entry status from validity dates (inclusive)', () => {
  const t = '2026-11-17';
  assert.equal(entryStatus({ effectiveStart: '2026-11-18', effectiveEnd: null }, t), 'Scheduled');
  assert.equal(entryStatus({ effectiveStart: '2026-11-01', effectiveEnd: '2026-11-16' }, t), 'Expired');
  assert.equal(entryStatus({ effectiveStart: '2026-11-01', effectiveEnd: '2026-11-17' }, t), 'Active');
  assert.equal(entryStatus({ effectiveStart: '2026-11-17', effectiveEnd: null }, t), 'Active');
});
test('valid entries, including peso-formatted input', () => {
  assert.deepEqual(validateEntryDraft(draft({ updatedPrice: '₱5,495.00', promoPrice: '4,995' }), p1, book), []);
  assert.deepEqual(validateEntryDraft(draft(), p1, book), []);
  assert.deepEqual(entryFromDraft(draft({ updatedPrice: '₱5,495.00', memo: ' x ' })),
    { productId: p1.id, updatedPrice: 5495, promoPrice: null, effectiveStart: '2026-11-01', effectiveEnd: '2026-11-30', memo: 'x' });
});
test('invalid entries report every problem', () => {
  const v = (o: Partial<PriceBookEntryDraft>, b = book) => validateEntryDraft(draft(o), p1, b);
  assert.deepEqual(v({ updatedPrice: '99.999' }), ['Updated selling price must be a positive amount with up to 2 decimals.']);
  assert.deepEqual(v({ promoPrice: 'abc' }), ['Promotional price must be a positive amount with up to 2 decimals.']);
  assert.deepEqual(v({ promoPrice: '0' }), ['Promotional price must be a positive amount with up to 2 decimals.']);
  assert.deepEqual(v({ updatedPrice: '-5' }), ['Updated selling price must be a positive amount with up to 2 decimals.']);
  assert.deepEqual(v({ updatedPrice: '5000', promoPrice: '5100' }), ['Promotional price cannot exceed the updated selling price.']);
  assert.deepEqual(v({ promoPrice: '6000' }), ['Promotional price cannot exceed the master list price.']);
  assert.deepEqual(v({ promoPrice: '4995', effectiveEnd: '' }, { effectiveDate: '2026-11-01', expirationDate: '' }), ['Promotional prices need an effective end date.']);
  assert.deepEqual(v({ effectiveEnd: '2026-10-31' }), ['Effective end cannot be before effective start.']);
  assert.deepEqual(v({ effectiveStart: '' }), ['Effective start date is required.']);
  assert.deepEqual(v({ effectiveStart: '2026-10-15' }), ['Effective start cannot be before the price book effective date.']);
  assert.deepEqual(v({ effectiveEnd: '2026-12-15' }), ['Effective end must be on or before the price book expiration date.']);
  assert.deepEqual(validateEntryDraft(draft(), undefined, book), ['Product is not in the catalog.']);
});
test('product search by ID or name and catalog integrity', () => {
  assert.deepEqual(searchProducts(PRODUCTS, ' 4800000100028').map((p) => p.id), ['4800000100028']);
  assert.ok(searchProducts(PRODUCTS, 'MONITOR').length >= 2);
  assert.equal(searchProducts(PRODUCTS, '').length, PRODUCTS.length);
  assert.equal(new Set(PRODUCTS.map((p) => p.id)).size, PRODUCTS.length);
  for (const p of PRODUCTS) {
    assert.match(p.id, /^4800\d{9}$/);
    for (const m of [p.masterListPrice, p.sellingPrice, p.cost]) assert.equal(parseMoney(m), m);
  }
});
```

- [ ] **Step 2: Run `npm run test -w frontend`** — Expected: FAIL.
- [ ] **Step 3: Implement `pricing.ts` and `mock-data/products.ts`.**
- [ ] **Step 4: Run `npm run test -w frontend`** — Expected: all pass.
- [ ] **Step 5: Commit** `feat: add mock product catalog and price entry calculations`

---

### Task 4: Price book operations and seed price books

**Files:**
- Create: `frontend/src/app/domain/price-books.ts`, `frontend/src/app/mock-data/price-books.ts`,
  `frontend/test/price-books.test.ts`

**Interfaces:**
- Consumes: Task 1 helpers; `Product`, `PriceBookEntry`, `PriceBookEntryDraft`, `validateEntryDraft`,
  `entryFromDraft`, `entryToDraft` (Task 3).
- Produces:
  - `interface PriceBook { id: string; name: string; description: string; effectiveDate: string; expirationDate: string | null; active: boolean; entries: PriceBookEntry[]; updatedAt: string; updatedBy: string }`
  - `interface PriceBookDraft { name: string; description: string; effectiveDate: string; expirationDate: string; active: boolean; entries: PriceBookEntryDraft[] }`
  - `interface PriceBookErrors { name?: string; effectiveDate?: string; expirationDate?: string; entries: Record<string, string[]>; form: string[] }`
  - `type StatusFilter = 'all' | 'active' | 'inactive'`
  - `emptyDraft(today: string): PriceBookDraft` (effectiveDate today, active true, everything else blank/empty)
  - `draftFromBook(book: PriceBook): PriceBookDraft`
  - `newEntryDraft(productId: string, book: Pick<PriceBookDraft, 'effectiveDate' | 'expirationDate'>): PriceBookEntryDraft` (start = book effective date, end = book expiration or `''`)
  - `validatePriceBook(draft: PriceBookDraft, books: readonly PriceBook[], catalog: readonly Product[], editingId: string | null): PriceBookErrors`
  - `hasErrors(errors: PriceBookErrors): boolean`
  - `nextPriceBookId(books: readonly PriceBook[]): string` — `PB-` + (max numeric suffix + 1) padded to 4.
  - `savePriceBook(books, draft, editingId: string | null, catalog, actor: string, now: Date): Result<{ books: PriceBook[]; book: PriceBook }>` (`updatedAt = now.toISOString()`, `updatedBy = actor`, name/description trimmed)
  - `duplicatePriceBook(books, id: string, actor: string, now: Date): Result<{ books: PriceBook[]; book: PriceBook }>` — new id, inactive, name `<name> (copy)` then `(copy 2)`, `(copy 3)`…, deep-copied entries.
  - `setPriceBookActive(books, id: string, active: boolean, actor: string, now: Date): Result<PriceBook[]>`
  - `filterPriceBooks(books, query: string, status: StatusFilter): PriceBook[]` — trimmed case-insensitive match on id, name or description; sorted by id ascending.
  - `mock-data/price-books.ts`: `SEED_PRICE_BOOKS: readonly PriceBook[]`, `updatedBy: 'Demo Product Lead'`,
    fixed `updatedAt` ISO strings in Oct–Nov 2026, entry `memo: ''` and `effectiveEnd` = book
    expiration unless stated:
    - `PB-0001` `Standard Retail 2026`, `Everyday shelf prices for all branches.`, 2026-01-01 → null,
      active; entries `4800000100011` updated 5595 (start 2026-01-01), `4800000200014` updated 1395.
    - `PB-0002` `November Monitor Sale`, `Monitor promotion for November.`, 2026-11-01 → 2026-11-30,
      active; `4800000100011` promo 4995, `4800000100028` promo 13995 (both 2026-11-01 → 2026-11-30).
    - `PB-0003` `December Holiday Promo`, `Holiday bundle pricing; awaiting approval.`, 2026-12-01 →
      2026-12-31, inactive; `4800000300017` promo 41995, `4800000200014` promo 1099 (2026-12-01 → 2026-12-31).
- Messages: name blank `Price book name is required.`; name > 80 chars `Name must be 80 characters or fewer.`;
  duplicate name (trimmed, case-insensitive, excluding `editingId`) `A price book named "<name>" already exists.`;
  invalid effective date `Effective date is required.`; invalid non-blank expiration
  `Expiration date must be a valid date.`; expiration < effective `Expiration date cannot be before the effective date.`;
  repeated product (form) `Product <id> is listed more than once.`; `savePriceBook` invalid →
  `Fix the highlighted fields before saving.`; unknown id → `Price book not found.`

- [ ] **Step 1: Write the failing tests**

```ts
const now = new Date('2026-11-17T02:00:00Z');
const base = (): PriceBookDraft => ({ ...emptyDraft('2026-11-17'), name: 'Weekend Flash Sale',
  entries: [{ ...newEntryDraft('4800000100011', { effectiveDate: '2026-11-17', expirationDate: '' }), updatedPrice: '₱5,495.00' }] });
test('ids increment from the highest existing id', () => {
  assert.equal(nextPriceBookId([]), 'PB-0001');
  assert.equal(nextPriceBookId(SEED_PRICE_BOOKS), 'PB-0004');
});
test('creating a price book converts prices and never stores master list prices', () => {
  const catalogBefore = JSON.stringify(PRODUCTS);
  const { books, book } = expectOk(savePriceBook(SEED_PRICE_BOOKS, base(), null, PRODUCTS, 'Demo Product Lead', now));
  assert.equal(book.id, 'PB-0004');
  assert.equal(book.entries[0].updatedPrice, 5495);
  assert.equal('masterListPrice' in book.entries[0], false);
  assert.equal(JSON.stringify(PRODUCTS), catalogBefore);
  assert.deepEqual([book.updatedAt, book.updatedBy], ['2026-11-17T02:00:00.000Z', 'Demo Product Lead']);
  assert.equal(books.length, 4);
  assert.equal(SEED_PRICE_BOOKS.length, 3);
});
test('editing keeps the id and allows keeping its own name', () => {
  const d = { ...draftFromBook(SEED_PRICE_BOOKS[0]), description: 'Updated memo' };
  const { book } = expectOk(savePriceBook(SEED_PRICE_BOOKS, d, 'PB-0001', PRODUCTS, 'Demo Admin', now));
  assert.deepEqual([book.id, book.name, book.description], ['PB-0001', 'Standard Retail 2026', 'Updated memo']);
  assert.equal(expectFail(savePriceBook(SEED_PRICE_BOOKS, d, 'PB-9999', PRODUCTS, 'x', now)), 'Price book not found.');
});
test('price book validation', () => {
  const e = (d: PriceBookDraft) => validatePriceBook(d, SEED_PRICE_BOOKS, PRODUCTS, null);
  assert.equal(e({ ...base(), name: ' ' }).name, 'Price book name is required.');
  assert.equal(e({ ...base(), name: 'november monitor sale ' }).name, 'A price book named "november monitor sale" already exists.');
  assert.equal(e({ ...base(), expirationDate: '2026-11-01' }).expirationDate, 'Expiration date cannot be before the effective date.');
  assert.equal(e({ ...base(), effectiveDate: '' }).effectiveDate, 'Effective date is required.');
  const dup = base(); dup.entries.push({ ...dup.entries[0] });
  assert.deepEqual(e(dup).form, ['Product 4800000100011 is listed more than once.']);
  const bad = base(); bad.entries[0].promoPrice = 'abc';
  assert.deepEqual(e(bad).entries['4800000100011'], ['Promotional price must be a positive amount with up to 2 decimals.']);
  assert.equal(hasErrors(e(base())), false);
  assert.equal(expectFail(savePriceBook(SEED_PRICE_BOOKS, bad, null, PRODUCTS, 'x', now)), 'Fix the highlighted fields before saving.');
});
test('duplicate creates an inactive independent copy with a unique name', () => {
  const first = expectOk(duplicatePriceBook(SEED_PRICE_BOOKS, 'PB-0001', 'x', now));
  assert.deepEqual([first.book.id, first.book.name, first.book.active], ['PB-0004', 'Standard Retail 2026 (copy)', false]);
  const second = expectOk(duplicatePriceBook(first.books, 'PB-0001', 'x', now));
  assert.equal(second.book.name, 'Standard Retail 2026 (copy 2)');
  first.book.entries[0].memo = 'changed';
  assert.equal(SEED_PRICE_BOOKS[0].entries[0].memo, '');
});
test('activate/deactivate and filtering', () => {
  const off = expectOk(setPriceBookActive(SEED_PRICE_BOOKS, 'PB-0002', false, 'x', now));
  assert.equal(off.find((b) => b.id === 'PB-0002')!.active, false);
  assert.equal(expectFail(setPriceBookActive(SEED_PRICE_BOOKS, 'PB-9', true, 'x', now)), 'Price book not found.');
  assert.deepEqual(filterPriceBooks(SEED_PRICE_BOOKS, 'HOLIDAY', 'all').map((b) => b.id), ['PB-0003']);
  assert.deepEqual(filterPriceBooks(SEED_PRICE_BOOKS, 'pb-0002', 'all').map((b) => b.id), ['PB-0002']);
  assert.deepEqual(filterPriceBooks(SEED_PRICE_BOOKS, '', 'inactive').map((b) => b.id), ['PB-0003']);
  assert.deepEqual(filterPriceBooks(SEED_PRICE_BOOKS, 'branches', 'active').map((b) => b.id), ['PB-0001']);
});
test('seed price books are valid', () => {
  for (const b of SEED_PRICE_BOOKS)
    assert.equal(hasErrors(validatePriceBook(draftFromBook(b), SEED_PRICE_BOOKS, PRODUCTS, b.id)), false, b.id);
});
```

- [ ] **Step 2: Run `npm run test -w frontend`** — Expected: FAIL.
- [ ] **Step 3: Implement `price-books.ts` and `mock-data/price-books.ts`.**
- [ ] **Step 4: Run `npm run test -w frontend`** — Expected: all pass.
- [ ] **Step 5: Commit** `feat: add price book operations and seed price books`

---

### Task 5: Sales report parsing, validation and per-product gross margin

**Files:**
- Create: `frontend/src/app/domain/sales-report.ts`, `frontend/src/app/domain/read-spreadsheet.ts`,
  `frontend/src/app/mock-data/sample-sales.ts`, `frontend/test/sales-report.test.ts`
- Modify: `frontend/package.json` — `npm install https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz -w frontend`

**Interfaces:**
- Consumes: `parseMoney`, `isBlank`, `toCents`, `fromCents`, `percentOf` (Task 1); `Product` (Task 3).
- Produces (`sales-report.ts`):
  - `type SalesField = 'productId' | 'productName' | 'quantity' | 'netSales' | 'cost'`
  - `type ColumnMapping = Record<SalesField, number | null>` (column index)
  - `type CostBasis = 'unit' | 'line'`; `type CostSource = 'report' | 'estimate' | 'mixed' | 'missing'`
  - `REQUIRED_FIELDS: readonly SalesField[] = ['productId', 'quantity', 'netSales']`
  - `FIELD_LABELS: Record<SalesField, string>` = Product ID, Product name, Quantity, Net sales, Cost
  - `validateUploadFile(name: string, size: number): string | null` — extension not `.csv/.xlsx/.xls`
    (case-insensitive): `Upload a .csv, .xlsx or .xls file.`; size 0: `The selected file is empty.`;
    size > 10 × 1024 × 1024: `Files must be 10 MB or smaller.`
  - `hasProductIdHeader(row: readonly unknown[]): boolean` — any cell matches a Product ID alias.
  - `findHeaderRow(rows: readonly unknown[][]): number` — first of the first 10 rows where
    `hasProductIdHeader`; else first non-blank row; `-1` if none.
  - `detectMapping(headers: readonly unknown[]): { mapping: ColumnMapping; costBasis: CostBasis }`
    Header normalisation: lower-case, strip non-alphanumerics. Aliases by priority:
    productId `productid, sku, itemcode, productcode, barcode`; productName
    `productname, itemname, product, item, description, name`; quantity
    `qty, quantity, qtysold, unitssold`; netSales `nettotal, netsales, netamount, linetotal,
    salesamount, amount, total`; cost — line aliases first `totalcost, linecost, extendedcost, cogs`
    (basis `line`), then unit aliases `unitcost, costperunit, cost` (basis `unit`). Default basis `unit`.
  - `normalizeProductId(value: unknown): string` — strings trimmed; finite integer numbers →
    `BigInt`-safe integer string with no exponent; `null`/`undefined` → `''`.
  - `missingRequiredFields(mapping: ColumnMapping): SalesField[]`
  - `interface SalesIssue { row: number; productId: string; message: string; excluded: boolean }` (`row` = 1-based spreadsheet row)
  - `interface ProductSalesLine { productId: string; productName: string; quantity: number; netSales: number; cogs: number | null; grossProfit: number | null; grossMarginPercent: number | null; costSource: CostSource; rowCount: number }`
  - `interface SalesReportTotals { quantity: number; netSales: number; knownCostNetSales: number; cogs: number; grossProfit: number; grossMarginPercent: number | null; productsWithCost: number; productsMissingCost: number }`
  - `interface SalesReportOptions { headerRow: number; mapping: ColumnMapping; costBasis: CostBasis; useEstimatedCost: boolean }`
  - `interface SalesReportResult { lines: ProductSalesLine[]; issues: SalesIssue[]; totals: SalesReportTotals; dataRows: number; includedRows: number; excludedRows: number }`
  - `buildSalesReport(rows: readonly unknown[][], options: SalesReportOptions, catalog: readonly Product[]): SalesReportResult`
- Row rules (rows after `headerRow`; fully blank rows skipped and not counted), first match wins for
  exclusion, messages exact:
  1. blank Product ID → `Missing Product ID.` (excluded)
  2. ID not in catalog (case-insensitive) → `Product ID not found in the mock product catalog.` (excluded)
  3. quantity or net sales parse negative → `Negative quantity or sales (refund/return) excluded from totals.` (excluded)
  4. quantity not a finite number > 0 → `Quantity must be a number greater than zero.` (excluded)
  5. net sales `parseMoney` null → `Net sales must be a valid amount.` (excluded)
  Cost for included rows: mapped + valid ≥ 0 → `report` (unit: `round(unitCents × qty)`; line: as is);
  non-blank but invalid/negative → warning `Cost is invalid; treated as missing.` then as missing;
  missing + `useEstimatedCost` → catalog cost × qty, `estimate`, warning
  `Cost estimated from current mock product cost (not historical).`; missing otherwise → warning
  `No historical cost in the report; COGS left blank.` Warnings have `excluded: false`.
- Aggregation per catalog product ID: catalog name; any missing-cost row → `cogs`, `grossProfit`,
  `grossMarginPercent` null and `costSource 'missing'`; else `report`, `estimate` or `mixed`.
  `grossProfit = netSales − cogs`; `grossMarginPercent = percentOf(gp, netSales)` (null when net 0).
  Lines sorted by net sales descending, then product ID. Totals: `netSales` over all lines;
  `knownCostNetSales`, `cogs`, `grossProfit` over lines with cost; `grossMarginPercent =
  percentOf(grossProfit, knownCostNetSales)`.
- `read-spreadsheet.ts`: `readSpreadsheet(file: File): Promise<unknown[][]>` — `await import('xlsx')`;
  `.csv` → `XLSX.read(await file.text(), { type: 'string', raw: true })` (all cells stay text);
  Excel → `XLSX.read(await file.arrayBuffer(), { type: 'array' })`; pick the first sheet whose rows
  give `findHeaderRow` a Product ID alias row, else the first sheet; rows via
  `sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: true })` so row numbers stay true.
- `sample-sales.ts`: `SAMPLE_SALES_ROWS: readonly (string | number)[][]` — header
  `['Product ID', 'Product Name', 'Date', 'Qty', 'Net Sales', 'Unit Cost']` then 15–25 rows over
  `PRODUCTS` dated 2026-10-01…2026-10-31 with historical unit costs, including exactly one unknown ID
  (`4800009999999`), one refund row (negative Qty) and one row with a blank Unit Cost.
  `sampleSalesCsv(): string` — RFC 4180 quoting (`27"` → `"27"""`), rows joined with `\r\n`, no
  trailing line break.

- [ ] **Step 1: Write the failing tests** (use a small inline catalog so numbers stay fixed)

```ts
const catalog: Product[] = [
  { id: 'A-1', name: 'Alpha', unit: 'PCS', onHand: 1, masterListPrice: 6500, sellingPrice: 6190, cost: 4900 },
  { id: 'B-2', name: 'Bravo', unit: 'PCS', onHand: 1, masterListPrice: 1500, sellingPrice: 1295, cost: 820 }];
const opts = (rows: unknown[][], o: Partial<SalesReportOptions> = {}): SalesReportOptions => ({
  headerRow: 0, ...detectMapping(rows[0]), useEstimatedCost: false, ...o });
const run = (rows: unknown[][], o: Partial<SalesReportOptions> = {}) => buildSalesReport(rows, opts(rows, o), catalog);
const H = ['SKU', 'Item', 'Qty', 'Net Total', 'Unit Cost'];
test('upload file validation', () => {
  assert.equal(validateUploadFile('r.CSV', 10), null);
  assert.equal(validateUploadFile('notes.txt', 10), 'Upload a .csv, .xlsx or .xls file.');
  assert.equal(validateUploadFile('r.xlsx', 0), 'The selected file is empty.');
  assert.equal(validateUploadFile('r.xls', 10 * 1024 * 1024 + 1), 'Files must be 10 MB or smaller.');
});
test('header row and column detection', () => {
  assert.equal(findHeaderRow([['Sales export'], [], ['Product ID', 'Qty']]), 2);
  assert.deepEqual(detectMapping(['Product ID', 'Product Name', 'Qty', 'Price', 'Unit Cost', 'Line Total', 'Net Total']),
    { mapping: { productId: 0, productName: 1, quantity: 2, netSales: 6, cost: 4 }, costBasis: 'unit' });
  assert.deepEqual(detectMapping(['SKU', 'Quantity', 'Amount', 'Total Cost']),
    { mapping: { productId: 0, productName: null, quantity: 1, netSales: 2, cost: 3 }, costBasis: 'line' });
  assert.deepEqual(missingRequiredFields(detectMapping(['Item', 'Amount']).mapping), ['productId', 'quantity']);
});
test('product IDs keep their digits', () => {
  assert.equal(normalizeProductId(' 4800000100011 '), '4800000100011');
  assert.equal(normalizeProductId(4800000100011), '4800000100011');
  assert.equal(normalizeProductId('0012'), '0012');
  assert.equal(normalizeProductId(null), '');
});
test('aggregates quantity, revenue, COGS, gross profit and margin per product', () => {
  const r = run([H, ['A-1', 'x', 1, '6,190.00', 4861], [' a-1 ', 'x', 2, 12000, '4861'], ['B-2', 'x', 2, 2590, 800]]);
  const a = r.lines.find((l) => l.productId === 'A-1')!;
  assert.deepEqual([a.productName, a.quantity, a.netSales, a.cogs, a.grossProfit, a.grossMarginPercent, a.costSource, a.rowCount],
    ['Alpha', 3, 18190, 14583, 3607, 19.83, 'report', 2]);
  assert.deepEqual(r.lines.map((l) => l.productId), ['A-1', 'B-2']);
  assert.deepEqual([r.totals.netSales, r.totals.cogs, r.totals.grossProfit, r.totals.grossMarginPercent], [20780, 16183, 4597, 22.12]);
});
test('line-total cost basis uses cost as given', () => {
  const r = run([['SKU', 'Qty', 'Net Total', 'Total Cost'], ['B-2', 2, 2590, 1640]]);
  assert.equal(r.lines[0].cogs, 1640);
});
test('partly costed products show no partial COGS', () => {
  const r = run([H, ['A-1', 'x', 1, 6190, 4861], ['A-1', 'x', 1, 6190, ''], ['B-2', 'x', 1, 1295, 820]]);
  const a = r.lines.find((l) => l.productId === 'A-1')!;
  assert.deepEqual([a.netSales, a.cogs, a.grossProfit, a.grossMarginPercent, a.costSource], [12380, null, null, null, 'missing']);
  assert.deepEqual([r.totals.netSales, r.totals.knownCostNetSales, r.totals.cogs, r.totals.productsMissingCost], [13675, 1295, 820, 1]);
  assert.deepEqual(r.issues.map((i) => [i.row, i.message, i.excluded]), [[3, 'No historical cost in the report; COGS left blank.', false]]);
});
test('estimated cost is opt-in and labelled', () => {
  const rows = [['SKU', 'Qty', 'Net Total'], ['B-2', 2, 2590]];
  assert.equal(run(rows).lines[0].cogs, null);
  const e = run(rows, { useEstimatedCost: true });
  assert.deepEqual([e.lines[0].cogs, e.lines[0].costSource, e.lines[0].grossMarginPercent], [1640, 'estimate', 36.68]);
  assert.equal(e.issues[0].message, 'Cost estimated from current mock product cost (not historical).');
  const m = run([H, ['B-2', 'x', 1, 1295, 800], ['B-2', 'x', 1, 1295, '']], { useEstimatedCost: true });
  assert.deepEqual([m.lines[0].cogs, m.lines[0].costSource], [1620, 'mixed']);
});
test('invalid rows are excluded with reasons and blank rows are skipped', () => {
  const r = run([H, ['', 'x', 1, 100, 1], ['Z-9', 'x', 1, 100, 1], ['A-1', 'x', -1, -6190, 4861], ['A-1', 'x', 0, 100, 1],
    ['A-1', 'x', 1, 'abc', 1], [null, null, null, null, null], ['A-1', 'x', 1, 0, 0], ['B-2', 'x', 1, 1295, 'n/a']]);
  assert.deepEqual(r.issues.map((i) => [i.row, i.message, i.excluded]), [
    [2, 'Missing Product ID.', true], [3, 'Product ID not found in the mock product catalog.', true],
    [4, 'Negative quantity or sales (refund/return) excluded from totals.', true],
    [5, 'Quantity must be a number greater than zero.', true], [6, 'Net sales must be a valid amount.', true],
    [9, 'Cost is invalid; treated as missing.', false], [9, 'No historical cost in the report; COGS left blank.', false]]);
  assert.deepEqual([r.dataRows, r.includedRows, r.excludedRows], [7, 2, 5]);
  assert.equal(r.lines.find((l) => l.productId === 'A-1')!.grossMarginPercent, null);
});
test('sample data and CSV round trip', async () => {
  const csv = sampleSalesCsv();
  assert.equal(csv.split('\r\n')[0], 'Product ID,Product Name,Date,Qty,Net Sales,Unit Cost');
  const rows = await readSpreadsheet(new File([csv], 'sample.csv'));
  assert.equal(rows.length - 1, SAMPLE_SALES_ROWS.length - 1);
  const r = buildSalesReport(rows, { headerRow: 0, ...detectMapping(rows[0]), useEstimatedCost: false }, PRODUCTS);
  assert.deepEqual(r.issues.filter((i) => i.excluded).map((i) => i.message).sort(),
    ['Negative quantity or sales (refund/return) excluded from totals.', 'Product ID not found in the mock product catalog.']);
  assert.equal(r.issues.filter((i) => !i.excluded).length, 1);
});
test('readSpreadsheet keeps CSV leading zeros and full numeric Excel IDs', async () => {
  const csvRows = await readSpreadsheet(new File(['Product ID,Qty\r\n0012,1'], 'a.csv'));
  assert.equal(csvRows[1][0], '0012');
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Notes']]), 'Cover');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Product ID', 'Qty'], [4800000100011, 2]]), 'Sales');
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  const rows = await readSpreadsheet(new File([buf], 'a.xlsx'));
  assert.equal(normalizeProductId(rows[1][0]), '4800000100011');
});
```

- [ ] **Step 2: Run `npm run test -w frontend`** — Expected: FAIL.
- [ ] **Step 3: Install `xlsx` into the frontend workspace and implement the three files.**
- [ ] **Step 4: Run `npm run test -w frontend`** — Expected: all pass.
- [ ] **Step 5: Commit** `feat: add frontend sales report parsing and gross margin aggregation`

---

### Task 6: Router, mock sign-in, guards and shared shell

**Files:**
- Modify: `frontend/package.json` + `package-lock.json` (`npm install @angular/router@21.2.25 -w frontend`)
- Create: `frontend/src/app/app.component.ts` (selector `app-root`, template `<router-outlet />`),
  `frontend/src/app/app.routes.ts`, `frontend/src/app/core/user-accounts.service.ts`,
  `frontend/src/app/core/auth.service.ts`, `frontend/src/app/core/guards.ts`,
  `frontend/src/app/layout/shell.component.ts` + `.html`,
  `frontend/src/app/pages/login/login.component.ts` + `.html`,
  `frontend/src/app/pages/forbidden/forbidden.component.ts`,
  placeholder pages (page heading only, filled by later tasks):
  `pages/users/users.component.ts` + `.html` (h1 `User accounts`),
  `pages/price-books/price-book-list.component.ts` + `.html` (h1 `Price books`),
  `pages/sales-report/sales-report.component.ts` + `.html` (h1 `Sales report by product`)
- Modify: `frontend/src/main.ts`, `frontend/src/app/components/dashboard/dashboard.component.ts`
  (selector `app-calculator`), `dashboard.component.html` (delete the `.app-shell`, `aside.sidebar`,
  `.main-shell`, `header.topbar` and `<main>` wrappers — lines 1–36 and 169–171 — keeping the content
  from `.page-heading` through `footer.page-footer` unchanged), `frontend/src/styles.scss`
- Create: `e2e/helpers.ts`, `e2e/access-control.spec.ts`
- Modify: `e2e/workflow.spec.ts` (replace each of the 9 `await page.goto('/')` with `await signIn(page)`)

**Interfaces:**
- Consumes: Tasks 1–2.
- Produces:
  - `UserAccountsService` (root): `users: Signal<readonly UserAccount[]>` (seeded from `SEED_USERS`),
    `accountingHead: Signal<UserAccount | undefined>`, and `add(actor: UserAccount, draft: NewUserDraft)`,
    `changeRole(actor: UserAccount, targetId: string, role: Role)`,
    `transferAccountingHead(actor: UserAccount, newHolderId: string, previousHolderRole: Exclude<Role, 'accounting-head'>)`,
    `setActive(actor: UserAccount, targetId: string, active: boolean)` — each returns
    `Result<UserAccount[]>`, fails with `You do not have permission to manage user accounts.` unless
    `hasPermission(actor.role, 'users')`, and updates `users` on success.
  - `AuthService` (root): `currentUser: Signal<UserAccount | null>` (computed from the signed-in id and
    `users`; null when that account is missing/inactive), `login(username: string, password: string):
    Result<UserAccount>`, `logout(): void`, `can(permission: Permission): boolean`.
  - `guards.ts`: `authGuard: CanActivateFn` (no user → `/login?returnUrl=<state.url>`),
    `permissionGuard: CanActivateChildFn` (reads `route.data['permission']`; missing → allow; not
    permitted → `/forbidden`), `guestGuard: CanActivateFn` (signed in → `homePath(role)`),
    `homeRedirectGuard: CanActivateFn` (→ `homePath(role)`).
  - `safeReturnUrl(url: string | null, role: Role): string` in `guards.ts` — returns `url` only when it
    starts with `/`, not `//`, and `pathPermission(url)` is null or permitted; otherwise `homePath(role)`.
  - Routes (`app.routes.ts`): `login` (guestGuard, title `Ledger | Sign in`); `''` → `ShellComponent`
    with `canActivate: [authGuard]`, `canActivateChild: [permissionGuard]`, children: `''` (pathMatch
    full, `homeRedirectGuard`, `children: []`), `calculator` (DashboardComponent, permission
    `calculator`, label `Bank rate calculator`, title `Ledger | Bank Rate Calculator`), `sales-report`,
    `price-books`, `users` (placeholders, permissions as named, labels `Sales report by product`,
    `Price books`, `User accounts`), `forbidden` (label `Access denied`); `**` → redirect `''`.
    Every child has `data: { permission?: Permission; label: string }`.
  - `main.ts`: `bootstrapApplication(AppComponent, { providers: [provideHttpClient(),
    provideRouter(routes, withInMemoryScrolling({ anchorScrolling: 'enabled', scrollPositionRestoration: 'top' }))] })`.
  - Shell: existing sidebar markup and classes; brand unchanged; workspace label
    `<ROLE LABEL> WORKSPACE`; `nav[aria-label="Main navigation"]` showing only permitted items, in
    order: `▦ Bank rate calculator` `/calculator`, `▤ Sales report by product` `/sales-report`,
    `◫ Price books` `/price-books`, `◉ User accounts` `/users`, `routerLinkActive="nav-current"`.
    While on `/calculator` show indented sub-links `Configuration settings` (fragment
    `configuration`) and `Calculation results` (fragment `results`) inside a `div.nav-sublinks`
    within the nav (so they are not direct `nav > a` children), hidden ≤ 800 px. Sidebar note:
    `Mock session` / `Demo accounts only. No database.` Topbar: `Workspace / <route label>`, a badge
    `<displayName> · <role label>` and a `Sign out` button (logout → navigate `/login`). Shell renders
    `<main><router-outlet /></main>`.
  - Login page (own centred layout, ledger brand): labelled inputs `Username`, `Password`, button
    `Sign in`, errors in `[role=alert].error-message` showing the `authenticate` message, a
    "Development accounts" box listing the three usernames, passwords and role labels with buttons
    `Use admin`, `Use accounting`, `Use productteam` that fill both fields. On success navigate to
    `safeReturnUrl(returnUrl query param, role)`.
  - Forbidden page: h1 `Access denied`, text `Your role (<role label>) cannot open this page.`, link
    `Go to your workspace` → `homePath(role)`.
  - `e2e/helpers.ts`: `ACCOUNTS = { admin: ['admin', 'Admin123!'], accounting: ['accounting', 'Accounting123!'], product: ['productteam', 'Product123!'] } as const`;
    `signIn(page: Page, username = 'admin', password = 'Admin123!'): Promise<void>` (goto `/login`,
    fill, click `Sign in`, `await expect(page).not.toHaveURL(/\/login/)`);
    `navigateInApp(page: Page, url: string): Promise<void>` — `history.pushState(null, '', url)` then
    dispatch `new PopStateEvent('popstate')`, so in-memory state survives (a full `page.goto` resets it);
    `signOut(page: Page): Promise<void>`; `navLinks(page: Page): Promise<string[]>` (trimmed text of
    `nav[aria-label="Main navigation"] > a`, excluding sub-links).

- [ ] **Step 1: Write the failing e2e tests in `e2e/access-control.spec.ts`**

```ts
test('unauthenticated deep link goes to sign-in and returns after login', async ({ page }) => {
  await page.goto('/users');
  await expect(page).toHaveURL(/\/login\?returnUrl=%2Fusers$/);
  await page.getByLabel('Username').fill('admin'); await page.getByLabel('Password').fill('Admin123!');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/users$/);
});
test('sign-in errors', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toHaveText('Enter your username and password.');
  await page.getByLabel('Username').fill('admin'); await page.getByLabel('Password').fill('wrong');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toHaveText('Invalid username or password.');
});
test('Admin sees every module', async ({ page }) => {
  await signIn(page, ...ACCOUNTS.admin);
  await expect(page).toHaveURL(/\/calculator$/);
  await expect(page.getByRole('heading', { name: 'Bank rate deduction calculator', exact: true })).toBeVisible();
  expect(await navLinks(page)).toEqual(['Bank rate calculator', 'Sales report by product', 'Price books', 'User accounts']);
  for (const [url, h] of [['/price-books', 'Price books'], ['/sales-report', 'Sales report by product'], ['/users', 'User accounts']]) {
    await navigateInApp(page, url); await expect(page.getByRole('heading', { level: 1, name: h })).toBeVisible();
  }
});
test('Accounting Head cannot open Price Books or accounts', async ({ page }) => {
  await signIn(page, ...ACCOUNTS.accounting);
  await expect(page).toHaveURL(/\/sales-report$/);
  expect(await navLinks(page)).toEqual(['Bank rate calculator', 'Sales report by product']);
  for (const url of ['/price-books', '/price-books/new', '/users']) {
    await navigateInApp(page, url);
    await expect(page).toHaveURL(/\/forbidden$/);
    await expect(page.getByText('Your role (Accounting Head) cannot open this page.')).toBeVisible();
  }
});
test('Product Team cannot open accounting reports or accounts', async ({ page }) => {
  await signIn(page, ...ACCOUNTS.product);
  await expect(page).toHaveURL(/\/price-books$/);
  expect(await navLinks(page)).toEqual(['Price books']);
  for (const url of ['/calculator', '/sales-report', '/users']) {
    await navigateInApp(page, url); await expect(page).toHaveURL(/\/forbidden$/);
  }
});
test('a returnUrl the new user cannot open falls back to their home', async ({ page }) => {
  await page.goto('/login?returnUrl=%2Fsales-report');
  await page.getByLabel('Username').fill('productteam'); await page.getByLabel('Password').fill('Product123!');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/price-books$/);
});
test('sign out protects routes again; shell fits a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, ...ACCOUNTS.admin);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await signOut(page);
  await expect(page).toHaveURL(/\/login/);
  await navigateInApp(page, '/calculator');
  await expect(page).toHaveURL(/\/login\?returnUrl=%2Fcalculator$/);
});
```

- [ ] **Step 2: Run `npx playwright test e2e/access-control.spec.ts`** — Expected: FAIL (no login page).
- [ ] **Step 3: Install the router and implement services, guards, routes, shell, login, forbidden,
  placeholders, `main.ts` and the dashboard template/selector change. Add login, shell-user and
  forbidden styles to the new `styles.scss` block (≤ 800 px: hide sub-links and the user badge text,
  keep `Sign out`). Update `e2e/workflow.spec.ts` to `import { signIn } from './helpers'` and sign in
  wherever it opened `/`.
- [ ] **Step 4: Verify**
  Run: `npm run build -w frontend` — Expected: build succeeds with no budget error.
  Run: `npx playwright test e2e/access-control.spec.ts e2e/workflow.spec.ts` — Expected: all pass
  (the actual-report test stays skipped without `SAMPLE_SALES`).
  If `navigateInApp` does not trigger guards, debug with superpowers:systematic-debugging before
  changing approach.
- [ ] **Step 5: Commit** `feat: add mock sign-in, role guards and shared application shell`

---

### Task 7: User accounts page (Admin)

**Files:**
- Modify: `frontend/src/app/pages/users/users.component.ts` + `.html`, `frontend/src/styles.scss`
- Create: `e2e/users.spec.ts`

**Interfaces:**
- Consumes: `UserAccountsService`, `AuthService` (Task 6); `ROLE_LABELS`, `Role` (Task 1).
- Page content (all actions pass `auth.currentUser()` as actor; failures show the service message in
  `.page-alert.error-message[role=alert]`; successes in `.notice[role=status]`):
  - Heading: eyebrow `ADMINISTRATION`, h1 `User accounts`, text
    `Mock development accounts for testing roles. Not production authentication.`
  - All role selects use option values equal to `Role` ids (`admin`, `product-team`) and option text
    from `ROLE_LABELS`.
  - Section `Accounting Head`: text `Current Accounting Head: <displayName> (<username>)`; select
    `New Accounting Head` (active accounts other than the current head, option text
    `<displayName> (<username>)`, value = account id); select
    `Role for previous Accounting Head` (`Admin`, `Product Team`; default `Product Team`); button
    `Transfer role`. Success notice: `<new displayName> is now the Accounting Head. <old displayName> is now <role label>.`
  - Table `User accounts`: columns Username, Display name, Role, Status, Actions. Role cell: select
    labelled `Role for <username>` with options `Admin`, `Product Team`; for the head, show the text
    `Accounting Head` and the hint `Use Transfer role to change` instead of a select. Status pill
    `Active` / `Inactive` (warning). Action button `Deactivate <username>` / `Activate <username>`.
    Role-change notice `Role updated for <username>.`; activation notice `<username> activated.` /
    `<username> deactivated.` After a failed role change the select shows the stored role again.
  - Form `Add account`: inputs `New username`, `Display name`, `Password` (type password), select
    `New account role` (`Admin`, `Product Team`), button `Add account`; notice `Account <username> added.`

- [ ] **Step 1: Write the failing e2e tests in `e2e/users.spec.ts`**

```ts
test('Admin transfers the Accounting Head role; exactly one holder remains', async ({ page }) => {
  await signIn(page, ...ACCOUNTS.admin); await navigateInApp(page, '/users');
  await page.getByLabel('New Accounting Head').selectOption({ label: 'Demo Product Lead (productteam)' });
  await page.getByLabel('Role for previous Accounting Head').selectOption({ label: 'Product Team' });
  await page.getByRole('button', { name: 'Transfer role' }).click();
  await expect(page.getByRole('status')).toHaveText('Demo Product Lead is now the Accounting Head. Demo Accountant is now Product Team.');
  const table = page.getByRole('table', { name: 'User accounts' });
  await expect(table.getByText('Accounting Head', { exact: true })).toHaveCount(1);
  await expect(page.getByLabel('Role for accounting')).toHaveValue('product-team');
  await signOut(page); await signIn(page, ...ACCOUNTS.product);
  await expect(page).toHaveURL(/\/sales-report$/);
  await signOut(page); await signIn(page, ...ACCOUNTS.accounting);
  await expect(page).toHaveURL(/\/price-books$/);
});
test('Accounting Head cannot be assigned through the role select', async ({ page }) => {
  await signIn(page); await navigateInApp(page, '/users');
  await expect(page.getByLabel('Role for productteam').locator('option')).toHaveText(['Admin', 'Product Team']);
  await expect(page.getByLabel('Role for accounting')).toHaveCount(0);
});
test('Admin adds an account that can sign in', async ({ page }) => {
  await signIn(page); await navigateInApp(page, '/users');
  await page.getByLabel('New username').fill('pricing.lead');
  await page.getByLabel('Display name').fill('Pricing Lead');
  await page.getByLabel('Password', { exact: true }).fill('Password1');
  await page.getByLabel('New account role').selectOption({ label: 'Product Team' });
  await page.getByRole('button', { name: 'Add account' }).click();
  await expect(page.getByRole('status')).toHaveText('Account pricing.lead added.');
  await signOut(page); await signIn(page, 'pricing.lead', 'Password1');
  await expect(page).toHaveURL(/\/price-books$/);
});
test('self-deactivation is refused; deactivated accounts cannot sign in', async ({ page }) => {
  await signIn(page); await navigateInApp(page, '/users');
  await page.getByRole('button', { name: 'Deactivate admin' }).click();
  await expect(page.getByRole('alert')).toHaveText(/You cannot deactivate your own account\./);
  await page.getByRole('button', { name: 'Deactivate productteam' }).click();
  await expect(page.getByRole('status')).toHaveText('productteam deactivated.');
  await signOut(page);
  await page.getByLabel('Username').fill('productteam'); await page.getByLabel('Password').fill('Product123!');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toHaveText('This account is inactive. Contact an Admin.');
});
```

- [ ] **Step 2: Run `npx playwright test e2e/users.spec.ts`** — Expected: FAIL.
- [ ] **Step 3: Implement the page.** Note the login form's `Password` label must stay distinct from
  the add form (`getByLabel('Password', { exact: true })` is used on `/users` only).
- [ ] **Step 4: Run `npx playwright test e2e/users.spec.ts e2e/access-control.spec.ts`** — Expected: PASS.
- [ ] **Step 5: Commit** `feat: add admin user account and role management page`

---

### Task 8: Price book services and list screen

**Files:**
- Create: `frontend/src/app/core/product-catalog.service.ts`, `frontend/src/app/core/price-book.service.ts`
- Modify: `frontend/src/app/pages/price-books/price-book-list.component.ts` + `.html`, `frontend/src/styles.scss`
- Create: `e2e/price-books.spec.ts`

**Interfaces:**
- Consumes: Tasks 3–4 domain; `AuthService` (Task 6).
- Produces:
  - `ProductCatalogService` (root): `products: Signal<readonly Product[]>` (from `PRODUCTS`),
    `byId(id: string): Product | undefined`, `search(query: string): Product[]`.
  - `PriceBookService` (root): `books: Signal<readonly PriceBook[]>` (from `SEED_PRICE_BOOKS`),
    `byId(id: string): PriceBook | undefined`,
    `save(actor: UserAccount, draft: PriceBookDraft, editingId: string | null): Result<PriceBook>`,
    `duplicate(actor: UserAccount, id: string): Result<PriceBook>`,
    `setActive(actor: UserAccount, id: string, active: boolean): Result<PriceBook>` — each fails with
    `You do not have permission to manage price books.` unless `hasPermission(actor.role, 'price-books')`;
    uses `actor.displayName`, `new Date()` and the catalog.
  - List page: eyebrow `PRICING`, h1 `Price books`, text
    `Create and manage selling and promotional price lists.`, link-button `New price book`
    (`/price-books/new`). Card toolbar: `.search-label` input labelled `Search price books`
    (placeholder `Search by ID, name or memo`), select `Status filter` (`All statuses`, `Active`,
    `Inactive`). Table `Price books`: Price Book ID, Name, Memo, Products (entry count), Validity
    (`Nov 1, 2026 – Nov 30, 2026` or `From Jan 1, 2026`), Status (pill `Active` / `Inactive`),
    Last updated (`Nov 17, 2026, 10:00 AM` + `by <updatedBy>`), Actions: links `View <id>`
    (`/price-books/<id>`), `Edit <id>` (`/price-books/<id>/edit`), buttons `Duplicate <id>`,
    `Deactivate <id>` / `Activate <id>` (accessible names exact; visible text may be shorter).
    Footer `<n> record(s)`. No match: `No price books match your filters.`
    Notices: duplicate `<new id> created as an inactive copy of <id>.`; toggle `<id> activated.` /
    `<id> deactivated.`; and on init show `history.state?.notice` when present (set by Task 9).

- [ ] **Step 1: Write the failing e2e tests (`e2e/price-books.spec.ts`, describe `Price book list`)**

```ts
test('search, filter and record count', async ({ page }) => {
  await signIn(page, ...ACCOUNTS.product);
  const rows = page.getByRole('table', { name: 'Price books' }).locator('tbody tr');
  await expect(rows).toHaveCount(3);
  await page.getByLabel('Search price books').fill('holiday');
  await expect(rows).toHaveCount(1);
  await expect(page.getByText('1 record(s)')).toBeVisible();
  await page.getByLabel('Search price books').fill('');
  await page.getByLabel('Status filter').selectOption({ label: 'Inactive' });
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('PB-0003');
});
test('duplicate and activate/deactivate', async ({ page }) => {
  await signIn(page, ...ACCOUNTS.product);
  await page.getByRole('button', { name: 'Duplicate PB-0001' }).click();
  await expect(page.getByRole('status')).toHaveText('PB-0004 created as an inactive copy of PB-0001.');
  const copy = page.getByRole('row').filter({ hasText: 'PB-0004' });
  await expect(copy).toContainText('Standard Retail 2026 (copy)');
  await expect(copy).toContainText('Inactive');
  await page.getByRole('button', { name: 'Deactivate PB-0002' }).click();
  await expect(page.getByRole('row').filter({ hasText: 'PB-0002' })).toContainText('Inactive');
  await page.getByRole('button', { name: 'Activate PB-0002' }).click();
  await expect(page.getByRole('row').filter({ hasText: 'PB-0002' })).toContainText('Active');
});
test('Admin can manage price books too', async ({ page }) => {
  await signIn(page, ...ACCOUNTS.admin); await navigateInApp(page, '/price-books');
  await expect(page.getByRole('button', { name: 'Duplicate PB-0002' })).toBeEnabled();
});
```

- [ ] **Step 2: Run `npx playwright test e2e/price-books.spec.ts`** — Expected: FAIL.
- [ ] **Step 3: Implement both services and the list page.**
- [ ] **Step 4: Run `npx playwright test e2e/price-books.spec.ts`** — Expected: PASS.
- [ ] **Step 5: Commit** `feat: add price book list with search, duplicate and activation`

---

### Task 9: Price book editor and product picker

**Files:**
- Create: `frontend/src/app/pages/price-books/price-book-editor.component.ts` + `.html`,
  `frontend/src/app/pages/price-books/product-picker.component.ts` + `.html`
- Modify: `frontend/src/app/app.routes.ts` (children `price-books/new` data `{ mode: 'create' }`,
  `price-books/:id` `{ mode: 'view' }`, `price-books/:id/edit` `{ mode: 'edit' }`, all permission
  `price-books`, label `Price books`), `frontend/src/styles.scss` (modal + editor table styles)
- Modify: `e2e/price-books.spec.ts` (describe `Price book editor`)

**Interfaces:**
- Consumes: `PriceBookService`, `ProductCatalogService`, `AuthService`; `emptyDraft`, `draftFromBook`,
  `newEntryDraft`, `validatePriceBook`, `hasErrors` (Task 4); `effectivePrice`, `priceSource`,
  `discountPercent`, `marginPercent`, `entryStatus` (Task 3); `parseMoney`, `todayInManila` (Task 1).
- Editor behaviour:
  - h1: `New price book` (create), `Edit price book` (edit), the book's name (view); eyebrow `PRICING`.
    Only the page-level alert uses `role="alert"`; field and entry errors are plain `.field-error` text.
  - Header card: `Price book ID` shown read-only (`Assigned on save` when new); inputs labelled
    `Price book name`, `Description / memo` (textarea), `Effective date` (type date),
    `Expiration date` (type date, optional), select `Status` (`Active`, `Inactive`).
  - Products card: title `Products (<n>)`, button `Add products` (opens picker). Table
    `Price book products` columns: Product ID, Product Name, Unit, Master List Price (read-only, from
    catalog), Cost (read-only), Updated Selling Price, Promotional Price, Discount %, Margin %
    (`marginPercent(effective price, cost)`, per the spec), Effective Start, Effective End, Status,
    Memo, Remove. *(Unit/Cost/Margin % added after final review; the first draft omitted them.)* Inputs labelled `Updated selling price for <id>`,
    `Promotional price for <id>`, `Effective start for <id>`, `Effective end for <id>`,
    `Memo for <id>`; button `Remove <id>`. Discount % = `discountPercent(master, effectivePrice)` of the
    currently parseable values, shown `5.18%` with caption `promo`/`updated`; `—` when no valid
    updated/promo; negative shown as `+10.00% markup`. Status pill from `entryStatus(…, todayInManila())`
    (`Scheduled` and `Expired` use `.warning`). Entry errors render in a full-width row under the entry.
    Empty: `No products yet. Use Add products to choose items from the catalog.`
  - Validation runs live but is displayed only after the first save attempt; header errors appear
    under each field; form errors and `Fix the highlighted fields before saving.` in a page alert.
  - Buttons (create/edit): `Save price book`, `Cancel`. Save success →
    `router.navigate(['/price-books', id], { state: { notice: 'Price book <id> saved.' } })`; the view
    page shows that notice. Cancel: if the draft differs from the initial draft and
    `!confirm('Discard unsaved changes?')` stay; else go to the view page (edit) or list (create).
  - View mode: same layout, values as text, buttons `Edit`, `Duplicate`, `Activate`/`Deactivate`,
    `Back to price books`. Duplicate navigates to the copy's view page with notice
    `<new id> created as an inactive copy of <id>.`
  - Unknown id: empty state `Price book not found.` with link `Back to price books`.
- Picker (`<app-product-picker [excludedIds]="string[]" (add)="string[]" (closed)="void">`):
  fixed overlay, `role="dialog"`, `aria-modal="true"`, title `Select products`, Escape and `Close`
  button close it, search input focused on open. Input `Search products` (placeholder
  `Product ID or name`) filters live, button `Search` (also filters). Table `Product catalog`: select
  checkbox `Select <id>`, Product ID, Name, Unit, On hand, Master List Price, Selling Price, Cost,
  Margin % (`marginPercent(sellingPrice, cost)`), header checkbox `Select all visible`. Excluded rows:
  checkbox disabled + pill `Added`. Footer `<n> record(s) · <m> selected`; buttons `Cancel` and
  `Add 1 product` / `Add <m> products` (disabled at 0). No match: `No products match "<q>".`
  Added products get `newEntryDraft(id, draft)`.

- [ ] **Step 1: Write the failing e2e tests**

```ts
test('Product Team creates a price book with updated and promotional prices', async ({ page }) => {
  await signIn(page, ...ACCOUNTS.product);
  await page.getByRole('link', { name: 'New price book' }).click();
  await page.getByLabel('Price book name').fill('Weekend Flash Sale');
  await page.getByLabel('Effective date').fill('2099-01-01');
  await page.getByLabel('Expiration date').fill('2099-01-31');
  await page.getByRole('button', { name: 'Add products' }).click();
  const dialog = page.getByRole('dialog', { name: 'Select products' });
  await dialog.getByLabel('Search products').fill('4800000100011');
  await dialog.getByLabel('Select 4800000100011').check();
  await dialog.getByLabel('Search products').fill('keyboard and mouse');
  await dialog.getByLabel('Select 4800000200014').check();
  await dialog.getByRole('button', { name: 'Add 2 products' }).click();
  await page.getByLabel('Updated selling price for 4800000100011').fill('₱5,495.00');
  await page.getByLabel('Promotional price for 4800000200014').fill('999');
  const table = page.getByRole('table', { name: 'Price book products' });
  const r1 = table.getByRole('row').filter({ hasText: '4800000100011' });
  await expect(r1).toContainText('₱5,795.00');
  await expect(r1).toContainText('5.18%');
  await expect(r1).toContainText('Scheduled');
  await expect(table.getByRole('row').filter({ hasText: '4800000200014' })).toContainText('33.18%');
  await page.getByRole('button', { name: 'Save price book' }).click();
  await expect(page).toHaveURL(/\/price-books\/PB-0004$/);
  await expect(page.getByRole('status')).toHaveText('Price book PB-0004 saved.');
  await expect(page.getByRole('table', { name: 'Price book products' }).getByRole('row').filter({ hasText: '4800000100011' })).toContainText('₱5,795.00');
  await page.getByRole('link', { name: 'Back to price books' }).click();
  await expect(page.getByRole('row').filter({ hasText: 'PB-0004' })).toContainText('Weekend Flash Sale');
});
test('invalid entries are reported and nothing is saved', async ({ page }) => {
  await signIn(page, ...ACCOUNTS.product);
  await page.getByRole('link', { name: 'New price book' }).click();
  await page.getByLabel('Effective date').fill('2099-02-01');
  await page.getByLabel('Expiration date').fill('2099-01-01');
  await page.getByRole('button', { name: 'Add products' }).click();
  await page.getByRole('dialog').getByLabel('Select 4800000100011').check();
  await page.getByRole('dialog').getByRole('button', { name: 'Add 1 product' }).click();
  await page.getByLabel('Promotional price for 4800000100011').fill('abc');
  await page.getByRole('button', { name: 'Save price book' }).click();
  await expect(page).toHaveURL(/\/price-books\/new$/);
  await expect(page.getByRole('alert')).toContainText('Fix the highlighted fields before saving.');
  for (const m of ['Price book name is required.', 'Expiration date cannot be before the effective date.',
    'Promotional price must be a positive amount with up to 2 decimals.']) await expect(page.getByText(m)).toBeVisible();
  await page.getByLabel('Promotional price for 4800000100011').fill('6000');
  await expect(page.getByText('Promotional price cannot exceed the master list price.')).toBeVisible();
});
test('edit, remove a product, and cancel with confirmation', async ({ page }) => {
  await signIn(page, ...ACCOUNTS.product);
  await page.getByRole('link', { name: 'Edit PB-0001' }).click();
  await page.getByLabel('Description / memo').fill('Revised shelf prices');
  await page.getByRole('button', { name: 'Remove 4800000200014' }).click();
  await page.getByRole('button', { name: 'Add products' }).click();
  await expect(page.getByRole('dialog').getByLabel('Select 4800000100011')).toBeDisabled();
  await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'Save price book' }).click();
  await expect(page.getByRole('status')).toHaveText('Price book PB-0001 saved.');
  await page.getByRole('link', { name: 'Back to price books' }).click();
  const row = page.getByRole('row').filter({ hasText: 'PB-0001' });
  await expect(row).toContainText('Revised shelf prices');
  await page.getByRole('link', { name: 'Edit PB-0002' }).click();
  await page.getByLabel('Price book name').fill('Changed');
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page).toHaveURL(/\/price-books\/PB-0002$/);
  await expect(page.getByRole('heading', { level: 1, name: 'November Monitor Sale' })).toBeVisible();
});
```

- [ ] **Step 2: Run `npx playwright test e2e/price-books.spec.ts`** — Expected: new tests FAIL.
- [ ] **Step 3: Implement the routes, editor and picker.**
- [ ] **Step 4: Run `npx playwright test e2e/price-books.spec.ts e2e/access-control.spec.ts`** — Expected: PASS.
- [ ] **Step 5: Commit** `feat: add price book editor and product picker`

---

### Task 10: Sales Report by Product page

**Files:**
- Modify: `frontend/src/app/pages/sales-report/sales-report.component.ts` + `.html`,
  `frontend/src/app/app.routes.ts` (make `sales-report` a `loadComponent` route so `xlsx` stays out of
  the initial bundle), `frontend/src/styles.scss`
- Create: `e2e/sales-report.spec.ts`

**Interfaces:**
- Consumes: Task 5 (`readSpreadsheet`, `validateUploadFile`, `findHeaderRow`, `detectMapping`,
  `missingRequiredFields`, `buildSalesReport`, `FIELD_LABELS`, `SAMPLE_SALES_ROWS`, `sampleSalesCsv`),
  `ProductCatalogService` (Task 8).
- Page content:
  - Eyebrow `ACCOUNTING REPORTS`, h1 `Sales report by product`, text
    `Upload a sales export to see quantity, revenue, cost and gross margin for each product.`, badge
    `Demonstration data`. Banner (`.notice`-style, always shown):
    `Demonstration data — calculations use mock products and costs and are not financial records.`
  - Section `01 Upload sales report`: file input labelled `Upload sales report file`
    (`accept=".csv,.xlsx,.xls"`), buttons `Load demo report` (rows = `SAMPLE_SALES_ROWS`, file name
    `Demo sales report (mock data)`) and `Download sample CSV` (saves `sample-sales-report.csv`).
    Upload errors from `validateUploadFile`, unreadable file `The file could not be read.`, no rows
    `No data rows were found.` — in `[role=alert]`. Shows file name and `<n> data rows`.
  - Mapping: selects `Product ID column`, `Product name column`, `Quantity column`, `Net sales column`,
    `Cost column` (options `— Not mapped —` + header texts), select `Cost basis`
    (`Unit cost × quantity` = `unit`, `Line total cost` = `line`), checkbox
    `Use current mock cost as an estimate when cost is missing`. Missing required →
    `Map the required columns (Product ID, Quantity, Net sales) to see results.`
  - Table `Upload preview`: header row in `thead` + first 10 non-blank rows after it in `tbody`.
  - Section `02 Gross margin by product` (only with a result): metrics `Net sales revenue`,
    `Cost of goods sold`, `Gross profit`, `Gross margin` (small text
    `<productsWithCost> products with known cost · <productsMissingCost> without`), and
    `Rows included` (`<includedRows> of <dataRows>`). Table `Sales by product`: Product ID, Product
    name, Qty sold, Net sales revenue, COGS, Gross profit, Gross margin %, Cost source (`Report cost`,
    `Estimate (current mock cost)`, `Report + estimate`, `Missing cost`), blanks shown as `—`, `tfoot`
    row `Total`. Footnote: `Gross Profit = Net Sales Revenue − Cost of Goods Sold · Gross Margin % =
    Gross Profit ÷ Net Sales Revenue × 100. Totals for cost, profit and margin include only products
    with known cost.`
  - Table `Rows needing review` (when issues exist): Row, Product ID, Issue, Treatment
    (`Excluded` / `Included`).
  - Results recompute (computed signal) whenever mapping, cost basis or the estimate checkbox change.

- [ ] **Step 1: Write the failing e2e tests**

```ts
const csv = (text: string, name = 'sales.csv') => ({ name, mimeType: 'text/csv', buffer: Buffer.from(text) });
test('Accounting Head uploads a CSV and sees gross margin per product', async ({ page }) => {
  await signIn(page, ...ACCOUNTS.accounting);
  await expect(page.getByText('Demonstration data — calculations use mock products and costs and are not financial records.')).toBeVisible();
  await page.getByLabel('Upload sales report file').setInputFiles(csv(
    'SKU,Item,Qty,Net Total,Unit Cost\r\n4800000100011,Monitor,1,"5,795.00",4681\r\n4800000100011,Monitor,2,11000,4681\r\n4800009999999,Unknown,1,100,50\r\n4800000200014,Combo,-1,-1295,820\r\n'));
  await expect(page.getByRole('table', { name: 'Upload preview' }).locator('tbody tr')).toHaveCount(4);
  const row = page.getByRole('table', { name: 'Sales by product' }).getByRole('row').filter({ hasText: '4800000100011' });
  await expect(row.locator('td')).toHaveText(['4800000100011', '24" IPS Monitor FHD 100Hz', '3', '₱16,795.00', '₱14,043.00', '₱2,752.00', '16.39%', 'Report cost']);
  const review = page.getByRole('table', { name: 'Rows needing review' });
  await expect(review).toContainText('Product ID not found in the mock product catalog.');
  await expect(review).toContainText('Negative quantity or sales (refund/return) excluded from totals.');
});
test('missing cost stays blank until the estimate is explicitly enabled', async ({ page }) => {
  await signIn(page, ...ACCOUNTS.accounting);
  await page.getByLabel('Upload sales report file').setInputFiles(csv('Product ID,Qty,Net Sales\r\n4800000200014,2,2590\r\n'));
  const row = page.getByRole('table', { name: 'Sales by product' }).getByRole('row').filter({ hasText: '4800000200014' });
  await expect(row).toContainText('Missing cost');
  await expect(row.locator('td').nth(4)).toHaveText('—');
  await page.getByLabel('Use current mock cost as an estimate when cost is missing').check();
  await expect(row).toContainText('Estimate (current mock cost)');
  await expect(row.locator('td').nth(4)).toHaveText('₱1,640.00');
  await expect(row.locator('td').nth(6)).toHaveText('36.68%');
});
test('unsupported files are rejected; demo report loads; admin has access', async ({ page }) => {
  await signIn(page, ...ACCOUNTS.admin); await navigateInApp(page, '/sales-report');
  await page.getByLabel('Upload sales report file').setInputFiles(csv('hello', 'notes.txt'));
  await expect(page.getByRole('alert')).toHaveText('Upload a .csv, .xlsx or .xls file.');
  await page.getByRole('button', { name: 'Load demo report' }).click();
  await expect(page.getByRole('table', { name: 'Sales by product' })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Rows needing review' }).locator('tbody tr')).toHaveCount(3);
});
```

- [ ] **Step 2: Run `npx playwright test e2e/sales-report.spec.ts`** — Expected: FAIL.
- [ ] **Step 3: Implement the page and the lazy route.**
- [ ] **Step 4: Verify** — `npx playwright test e2e/sales-report.spec.ts` PASS; `npm run build -w frontend`
  succeeds and the build output lists `xlsx` in a lazy chunk, not the initial bundle.
- [ ] **Step 5: Commit** `feat: add frontend Sales Report by Product with gross margin`

---

### Task 11: Documentation and full verification

**Files:**
- Modify: `README.md` — add a section `Mock accounts, price books and product sales (frontend prototype)`
  after "Use the calculator": the three accounts and access matrix, Accounting Head transfer rule,
  in-memory behaviour (refresh signs out and resets data), Price Book price separation and discount
  formula, Sales Report formulas and cost-source rules, demo data notice; extend "Project layout" with
  `domain/`, `mock-data/`, `core/`, `layout/`, `pages/`, `frontend/test/`; mention `npm test` now also
  runs frontend domain checks and browser tests sign in first.

- [ ] **Step 1: Run `npm test`** — Expected: backend and frontend checks all pass.
- [ ] **Step 2: Run `npm run build`** — Expected: both workspaces build; no budget error.
- [ ] **Step 3: Run `npm run test:e2e`** — Expected: all specs pass (actual-report test skipped).
- [ ] **Step 4: Run `npx prettier --check` on every file changed on this branch** — Expected: clean.
- [ ] **Step 5: Commit** `docs: describe mock RBAC, price books and product sales report`
