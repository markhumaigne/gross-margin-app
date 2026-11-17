# Price Book → Sales Report link — Design (short)

Date: 2026-11-17 · Branch: `test` · Extends `2026-11-17-price-book-design.md`

## Intent

When the Product Team updates or activates a price book, the Accounting "Sales report by product"
reflects it: sales recorded under a Price ID show that price book's promotional or updated price,
the expected revenue at that price and the variance against what was actually sold.
Frontend-only, in-memory, demonstration data.

## Decided by the user

- **Alongside actual:** price-book figures are added next to the actual figures. Revenue, COGS,
  gross profit and gross margin keep using the report's actual net sales.
- **Match by the row's PriceID:** the user's real sales report carries a `PriceID` per line (e.g.
  `PL000013`, `PS000015`, many blank). A row with a PriceID uses that price book; a blank PriceID
  means the item sold at regular price (no price book, no variance). Sale dates are not used.
- **IDs follow the POS format:** `PL` + 6 digits (e.g. `PL000035`). `PS` + 6 digits is just another
  ID series, matched the same way.

## Approaches considered

1. Price-book figures alongside actual (chosen) vs replacing revenue vs display-only.
2. Match by row PriceID with blank = regular (chosen) vs PriceID with date fallback vs date only.

## Design (builder calls marked *)

**Price Book IDs**
- Format `^(PL|PS)\d{6}$`, stored upper-case, unique, immutable after creation.
- *Create form gets an **Auto ID** toggle (on by default) → next `PL` number (highest PL suffix + 1).
  Turning it off allows typing an ID such as `PL000754` or `PS000015` to mirror a POS price list.*
  Errors: `Price ID must be PL or PS followed by 6 digits (e.g. PL000123).`,
  `Price ID <ID> is already used.` Duplicate always takes the next PL number.
- *Seed books are renumbered to IDs present in the user's report:* `PL000013` Standard Retail 2026,
  `PL000030` November Monitor Sale, `PL000034` December Holiday Promo (inactive). Next new ID:
  `PL000035`.

**Sales report matching**
- New optional column mapping **Price ID** (aliases: PriceID, Price ID, Price Book ID, Price List ID,
  Price List, Price Book).
- Per included row (after the existing validation):
  - Blank Price ID → *Regular price*; no price-book figures.
  - ID not found → included, comparison status `Price ID not found`.
  - Book inactive → `Price book inactive` (no price; reflects deactivation immediately).
  - Product not in that book → `Product not in price book`.
  - Otherwise **Matched**: price-book price = promotional price, else updated price, else master list
    price; expected revenue = quantity × that price (centavos); variance = actual net sales −
    expected revenue. *Entry validity dates are not checked: the POS already applied that ID.*
- *Rows with a non-matched status also get an included-row note in **Rows needing review**.*

**Output**
- Gross margin table: one extra column **Price ID** (distinct IDs used by the product's rows,
  comma-joined; `Regular price` when all blank).
- *New section **Price book comparison**, one line per Price ID × product (regular-price rows not
  listed): Price ID, Product ID, Product name, Qty, Actual net sales, Price-book price (with
  `promo`/`updated` caption), Expected revenue, Variance, Status. Unmatched lines show blanks for
  price/expected/variance. Totals and metrics (matched lines only): actual, expected, variance.*
- Footnote: matching rule; variance = actual − expected; regular-price rows excluded.
- Demo sample report gains a `Price ID` column using `PL000013`, `PL000030`, one unknown `PS000015`
  and blanks.

**Live link**
- The report is a computed view over the shared in-memory price book store: a Product Team change
  shows when Accounting next views the report in the same browser session (sign out → sign in keeps
  memory; refresh resets it). Accounting reads price books but still cannot open or edit them.

## Testing

- Domain: ID format/uniqueness/auto-numbering; Price ID detection; row statuses (blank, not found,
  inactive, product missing, matched promo vs updated); expected/variance math; comparison grouping
  and totals; gross-margin figures unchanged by price books.
- E2E: Product Team creates a manual-ID book; Accounting loads the demo and sees PL000013 matched
  with price and variance; Product Team edits PL000013's updated price → Accounting sees the new
  price/variance; deactivating PL000013 shows `Price book inactive`.
