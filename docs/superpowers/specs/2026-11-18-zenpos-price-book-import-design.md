# ZenPOS price book import and supplier Support

## Why

The product team maintains prices in ZenPOS. The boss wants the app's price books loaded straight from ZenPOS **Price Book** exports, not retyped and not guessed from sales exports. The product manager (PM) also needs to record the **Support** a supplier pays on external promotions (PS), so that price book margins and the Accounting calculator show what the business actually earns. Example from the samples: the Sony PS books sell the WF-1000XM5 at ₱11,999 against a ₱12,749.25 cost (−5.9% in ZenPOS). Sony's support is what makes that sale profitable, and today the app cannot show it.

## Price ID types

| Prefix | Meaning | Support |
|---|---|---|
| PL | Managed price only | None |
| PS | External promotion (supplier support or rebate) | Yes, entered by the PM per product |
| PI | Internal promotion (no rebate) | None |

## Goals

1. Import one or more ZenPOS Price Book exports from the Price books page. Each file creates or updates the price book with its Price ID.
2. PS books get a **Support** value per product, entered by hand by the PM in **pesos per unit**. *(Changed on 2026-11-18 after review: Support was first designed as ₱ or %, chosen per product; the user confirmed Support is pesos only.)*
3. Price book margins use ZenPOS's formula (margin on cost), so imported numbers match ZenPOS. PS books also show margin after support.
4. The calculator adds support to sales made under a PS Price ID: support per product and in total, plus gross profit and gross margin after support.
5. PI IDs are accepted everywhere PL and PS are.
6. Imported books stay fully editable in the app, so small changes don't need a new ZenPOS export.

## Non-goals

- Building price books from the sales export. That import is removed from the Price books page.
- ZenPOS restrictions (Limited Days, Time, Regions, Branches, Price Levels) are not imported or enforced. ZenPOS already enforces them at the till, and the calculator trusts the Price ID the POS recorded. *(My call.)*
- Sending price books back to ZenPOS, or exporting them.
- A server database. Pricing data stays in browser storage as it is today.
- Support on PL or PI books.
- Checking a sale's date against the promo period in the calculator. Existing behavior is kept: the POS applied the ID.

## Anti-goals (failure even if it "works")

- A re-upload that wipes Support the PM already typed.
- Price book margins that differ from ZenPOS for the same price and cost.
- The calculator's gross margin changing meaning. It stays margin on sales.
- Importing one book changing any other book.

## Constraints

- Angular, frontend-only demo. Price books and products live in one localStorage snapshot (`ledger.pricing.v1`, `frontend/src/app/domain/pricing-storage.ts`) shared by the demo accounts on the browser. **Data already saved by the current version must still load.**
- Only roles with the `price-books` permission (Product Team, Admin) can import or edit. Accounting sees the effect in the calculator.
- **Storage size.** The PL sample (1,419 products) is about 550 KB once stored. Browser storage holds about 5 MB, so roughly eight or nine books that size fit. When storage is full, the existing "Browser storage is unavailable or full" error appears and nothing from that import is saved. The November sales export references about 30 PL IDs, so importing every PL book may not fit. Fixing that needs a server database, which is out of scope.
- Money arithmetic uses the existing centavo helpers (`domain/money.ts`). Percentages use `percentOf`.
- Product IDs are barcodes. Excel stores most as numbers (11–14 digits, within the safe integer range) and displays them as `5.70712E+12`. Read the raw cell value and convert it to an integer string, never the displayed text. IDs stored as text keep their leading zeros (for example `097855213693`).
- The ZenPOS samples are real company data and are git-ignored (`*.xlsx`). Tests use synthetic fixtures built in code in the same format. The samples are only for manual checks.

## ZenPOS Price Book export (from the five samples)

- One price book per file, sheet `Price Book`.
- Rows 1–2 hold the company name and `Price Book`. Label/value pairs follow in columns A/B:
  - `Price ID:` e.g. `PS000005`
  - `Name:` (ZenPOS truncates it at 64 characters)
  - `Active:` `Yes` / `No`
  - `Memo:` free text, often several lines (e.g. `REF#: 2026002485` plus date ranges)
  - `Limited Period:` `No`, or `Yes (MM/DD/YYYY~MM/DD/YYYY)`
  - `Limited Days:`, `Limited Time:`, `Limited Regions:`, `Limited Branches:`, `Limited Price Levels:` (ignored)
- A header row, then one row per product:
  `Product ID | Name | Qty | to Qty | Unit | Unit Price | Discount | Disc % | Price After Discount | Stnd Cost | Margin`
  (the "Price After Discount" header contains a line break).
- Observed in all samples: Discount and Disc % are blank, Qty is 0, to Qty is 99999, Unit is PCS, and there are no duplicate Product IDs.
- Margin is text such as `9.3%`, equal to (Price After Discount − Stnd Cost) ÷ Stnd Cost.
- The parser locates labels and the header by their text, not fixed row numbers.

## Approaches considered

- **A. Imported rows become manual-style entries, with Support added. Chosen.** Each ZenPOS row keeps its own name, unit, prices, cost and Support inside its price book, using the entry's existing `manual` details (`domain/manual-products.ts`). That shape already mirrors ZenPOS's columns. A re-upload only touches that book. Trade-off: the same product's cost is stored in every book that lists it, which is also how ZenPOS works (each book carries its own Stnd Cost).
- **B. Import products into the shared catalog.** Rejected. A re-upload of one book would change cost for every other book using that product. The export also has no master price, so the catalog's updated/promo price split cannot be filled reliably.
- **C. Rebuild every price book row into one ZenPOS shape.** Rejected for now. It means migrating saved data and the demo books and rewriting the editor and the calculator lookup, with no visible gain.

## Design

### Data

- **Price ID pattern** becomes `^(PL|PS|PI)\d{6}$` in validation, manual ID entry and storage. Auto-assigned IDs for new books stay PL.
- **Duplicate** gives the copy the next free number with the **same prefix** as the source (PS000005 → next PS, PI → next PI, PL → next PL), so a PS copy keeps its Support. `nextPriceBookId` takes a prefix, defaulting to PL. *(My call.)*
- **Imported rows** are entries with `manual` details. The shared catalog is never touched by this import.

| ZenPOS column | Entry field |
|---|---|
| Product ID | `productId` (barcode rule above) |
| Name | `manual.name` |
| Qty / to Qty | `manual.qty` / `manual.toQty`, kept as in the file (0 and 99999) |
| Unit | `manual.unit` (blank becomes `PCS`) |
| Unit Price | `manual.unitPrice` |
| Discount / Disc % | `manual.discount` / `manual.discountPercent` (blank becomes 0) |
| Price After Discount | `manual.netPrice`, and `updatedPrice` (the price the calculator looks up, as manual rows do today) |
| Stnd Cost | `manual.cost` |
| Margin | not read; calculated (below) |
| *(not in export)* | `manual.masterListPrice`: Unit Price for a new row; on re-upload the row keeps its existing value. *(My call.)* |

- Entry effective start and end equal the book's dates.
- **Qty validation** allows 0, because ZenPOS uses 0 as "from any quantity". It currently requires more than 0.
- **Support** is a new optional entry field: a peso amount per unit (`number`), or absent for no support.
  - Only kept on PS books. Saving a PL or PI book drops it.
  - Any row in a PS book can carry Support, whether it is a ZenPOS/manual row or a catalog-linked row. A catalog-linked row's margin after support uses the catalog product's cost and its effective price. *(My call.)*
  - The value is 0 or more with up to 2 decimals. A blank value means no support.
  - Support saved during testing in the earlier `{ kind, value }` shape still loads: peso amounts are kept, percent Support is dropped.
- **Margin is calculated, no longer typed.** This changes the earlier manual-products design, which saved Margin as typed, because Support has to move it.
  - **Margin on cost** = (net price − cost) ÷ cost × 100. A cost of 0 shows "—".
  - **Margin after support** (PS only) = (net price − net cost) ÷ net cost × 100, where net cost = cost − support per unit. A net cost of 0 or less shows "—".
  - Catalog-linked rows in the price book table also show margin on cost, so one table uses one formula.
  - A `margin` value in previously saved data is ignored. It must not stop the data loading.
  - Example: net price ₱11,999, cost ₱12,749.25. Margin on cost = −5.88%. With ₱1,500 support, net cost = ₱11,249.25 and margin after support = +6.66%.

### Import

- The Price books page replaces **Import from sales export** with **Import ZenPOS price book**. It accepts the same file types and size limit as today's upload and allows **several files at once** *(my call)*. The page's help text is updated to describe the new import.
- **Each file is handled on its own.** A file that is not a price book export, has no Price ID, has an unsupported prefix, or has no product rows is skipped with a reason. The other files still import.
- **New Price ID: create the book.**
  - Name comes from `Name:`. If another book already has that name, the Price ID is appended, as in `Name (PS000010)` *(my call; book names must stay unique)*.
  - Description comes from `Memo:`, with line breaks kept.
  - Active comes from `Active:`.
  - Effective and expiration dates come from `Limited Period:`. `No` means effective today (Manila) with no expiration.
- **Existing Price ID: update the book from the file.**
  - Name, description, active flag and dates come from the file. The same name-clash rule applies (against other books only).
  - When the file says `Limited Period: No`, the book keeps its current effective date and its expiration is cleared. The date is not reset to today on every re-upload. *(My call.)*
  - The rows are replaced by the file's rows. For a product in both the old book and the file, the old row's Support, row memo and master list price are kept, because those are app-only values.
  - Products not in the file are removed. New products come in with no Support.
  - Catalog-linked rows in an existing book (for example the demo seed books, whose IDs PL000013/PL000030/PL000034 clash with real ZenPOS IDs) are treated the same way: kept only if their product is in the file, and then they become ZenPOS rows.
  - The book is stamped with the importing user and time.
  - Importing the same file twice produces the same result.
- **Rows skipped and counted:** a blank Product ID; a Price After Discount or Stnd Cost that is blank, unreadable or negative; and a Product ID repeated in the same file (the first one is kept).
- **Each file is saved on its own.** If browser storage fills partway through a multi-file import, the files already saved stay saved. The full file is reported as "not saved: browser storage is full", and the remaining files are still tried. *(My call.)*
- "Prices changed" counts products present in both the old book and the file whose net price differs.
- **Summary after import, one line per file.** Examples:
  - `PL000013 created: 1,419 products`
  - `PS000005 updated: 2 added, 1 removed, 5 prices changed, Support kept on 64`
  - Skipped rows and skipped files with their reasons
- **Sample download:** the page's **Download sample export** becomes a fictional ZenPOS price book file in the same format *(my call)*. The calculator keeps its own sales sample.
- The sales-export price book import (`domain/sales-import.ts` and its service method) is deleted, since nothing else uses it.

### Editing in the app

- **Price book table**, PS books only, adds two columns after the margin column:
  - **Support:** a peso amount input when editing, and text such as `₱1,500.00` when viewing.
  - **Margin after support:** calculated.
  - PL and PI books do not show these columns.
- The margin column header becomes **Margin on cost**.
- **Add products, Manual entry** (and the existing per-row **Edit**, which reuses the same form):
  - On PS books it adds a Support field (₱ per unit).
  - Margin is no longer typed. The calculated margins show in the price book table, not in the form. *(Changed on 2026-11-18 at the user's request.)*
  - This is where the PM edits price, cost or anything else on an imported row.
- **Duplicate** copies Support along with the rest of the row.

### Calculator

- The price-book lookup (`domain/price-match.ts`) also returns the entry's Support when the book is PS.
- **Support counts even if the PS book is inactive.** A PM may deactivate a promo after it ends, and sales made during it still earn support. The price comparison still shows "Price book inactive" for that line. *(My call.)*
- **Support per sales row** with a PS Price ID and a matching entry that has Support:
  - Support per unit × quantity, rounded to the centavo per row.
  - Rows with net sales of ₱0 earn no support. These look like free items (7 of the 334 PS rows in the November export), and counting them would raise the amount claimed from the supplier. *(My call.)*
- After-support totals cover the same products as the existing gross profit totals (products with a known cost). The Support total covers every row that earns support.
- **Product sales table:**
  - New columns **Support** and **Gross margin after support %**.
  - Gross profit after support = net sales − COGS + support. Gross margin after support = gross profit after support ÷ net sales.
  - When COGS is missing, the after-support figures are blank too.
  - Totals include support, gross profit after support and gross margin after support.
- **Labels:**
  - Existing margin labels read **Gross margin on sales**, so they are not confused with the price book's margin on cost.
  - Inside the product sales table, the column is labelled **Gross margin on sales %**.
- **Price ID comparison:** a new **Support** column per line, and a **Support to claim** total in its summary.

### Storage

- Entry validation accepts the `support` field, PI IDs, a Qty of 0, and old entries that still carry `margin`.
- Data saved by the current version loads unchanged.
- Whether this needs a snapshot version bump is left to the builder, provided old data still loads.

## Left to the builder

- Component structure, signal wiring and styling, reusing the existing editor, picker and list components and their styles.
- How the fictional sample price book file is generated (follow `domain/sample-export-file.ts`).
- Exact wording of summaries and errors, matching the existing tone.
- Unit tests in `frontend/test` for the parser (labels, period parsing, barcode conversion, skipped rows), the re-import merge (Support kept, rows added and removed), margin and support math, PI IDs, and storage compatibility. E2E coverage follows `e2e/price-books.spec.ts` and `e2e/manual-products.spec.ts` for import, entering Support, and seeing it in the calculator.
- Updating `README.md` for the new import, PI IDs, Support and margin labels.
