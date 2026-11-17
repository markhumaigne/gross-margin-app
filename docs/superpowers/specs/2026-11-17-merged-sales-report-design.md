# One page: Bank rate calculator with product sections — Design (short)

Date: 2026-11-17 · Branch: `test` · Supersedes the separate Sales Report page in
`2026-11-17-price-book-design.md` and the "Output" part of `2026-11-17-price-book-sales-link-design.md`
(Price ID format and matching rules from that doc still apply).

## Intent

The POS "Sales Report by Product" export is the same file the bank rate calculator already processes
(Product ID, Product Name, Date, TM-INV#, Qty, Unit, Price, Cost, Net Total, Master Price,
Selling Price, Price ID, Payment, Branch …). Accounting should upload it **once** and get bank
deductions, gross margin by product and the Price ID / price book comparison on **one page**.

## Decided by the user

- **One page, one upload**, keeping the name **Bank rate calculator** (user changed this on
  2026-11-17: the sidebar item "Sales report by product" is removed because the calculator already
  processes the Sales Report by Product export). The separate frontend-only Sales Report page is removed.
- **Products for price books:** demo catalog **plus** products imported from an uploaded export
  (in memory only; nothing saved to the repository).
- **Excel download unchanged:** the 4-sheet workbook stays exactly as it is; the new sections are
  on screen only. No backend changes.
- (Earlier) Price IDs `PL`/`PS` + 6 digits; a sale's Price ID picks the price book; blank = regular
  price; price-book figures sit alongside actual figures.

## Approaches considered

- One page/one upload keeping the calculator name (chosen) vs renaming it vs two pages sharing an upload.
- Products: catalog + export import (chosen) vs demo catalog only vs comparing file prices only.
- Excel: on screen only (chosen) vs adding two sheets via a backend change.

## Design (builder calls marked *)

**Navigation and access**
- One sidebar item **Bank rate calculator** at `/calculator` (existing `DashboardComponent`) with
  the new sections. The "Sales report by product" sidebar item and `/sales-report` route are removed;
  `/sales-report` redirects to `/calculator`.
- Permission `sales-report` is removed; `calculator` (Admin, Accounting Head) covers everything.
  Admin and Accounting Head both land on `/calculator`. Product Team unchanged.
- Page name and heading stay "Bank rate deduction calculator"; *subtitle mentions gross margin by
  product and price book pricing.* Existing calculator sections, rates, 17-column results and
  download are unchanged.
- The old `pages/sales-report` component, its CSV/demo upload and the opt-in mock-cost estimate are
  removed.

**New sections (after a successful calculation, computed in the browser from the same file)**
- *05 Gross margin by product:* per Product ID — product name (from the file), quantity, net sales
  revenue, COGS, gross profit, gross margin %, Price ID(s) (`Regular price` for blank rows).
  Cost basis follows the calculator's selection (auto → detected basis). Missing cost → blank
  COGS/GP/GM for that product and flagged (never estimated). *Labelled "before bank charges";
  the 17-column table keeps the after-charges GrossMargin.* Rows the file can't support (missing ID,
  zero/invalid quantity or net total, refunds) are listed with reasons.
- *06 Price book comparison:* one line per Price ID × product for rows with a Price ID — Price ID,
  Product ID, name, qty, actual net sales, **POS selling price** (file's Selling Price), price-book
  price (promo/updated/master), expected revenue, variance (actual − expected), status (Matched,
  Price ID not found, Price book inactive, Product not in price book). Totals over matched lines.
  Updates live when price books change (computed over the price book store; the page is kept alive).
- Header detection on the client reuses the calculator's selected sheet and header row; Price ID,
  Master Price and Selling Price columns are detected by name (`Price ID`/`Price\nID`, etc.).

**Products from an export (Price Books)**
- Product picker gets **Import products from sales export** (`.xlsx`, `.xls`, `.csv`, ≤ 10 MB).
  One product per Product ID: name, unit, master list price (Master Price, else Selling Price),
  selling price (Selling Price, else Master Price), unit cost (Cost; blank → unknown).
  *First row with a valid price wins; rows without an ID or any price are skipped; existing catalog
  IDs are never overwritten.* Imported products show an `Imported` tag and on-hand `—`; margin shows
  `—` when cost is unknown. Session only.

**Price lists from an export (Price Books)** — user decision: import price lists too.
- The same import also creates price books from the Price IDs found in the file (observed: ~30
  IDs per day; PL lists usually price *above* Master Price, median +12%; PS IDs usually *below*).
- Per Price ID × product the price is the POS **Selling Price** (*most frequent value when a product
  has several; ties → first row*). PL and other IDs → **updated selling price**; PS IDs with a price
  ≤ master → **promotional price**, otherwise updated price.
- *New IDs become **active** books named `Imported <ID>`, description `Imported from <file> (POS
  selling prices).`, effective date = the report's sale date (else today); PL books open-ended,
  PS books effective and expiring on that date (entries likewise) so promo validation holds.*
- *Existing IDs are never overwritten: products not yet in that book are added; existing entries
  stay as they are.* A summary notice reports new books, books extended and products added.

**Footer rows** — user decision: skip them in the calculator too.
- The newer export ends with a `TOTAL:` row (in TM-INV#) and an `… NOTHING FOLLOWS …` row (in
  Product ID). The backend parser skips rows whose invoice is `TOTAL:` with no Product ID, or any
  row containing `NOTHING FOLLOWS`; they no longer count as items or appear in Needs Review.
  The browser parsers (product sections, import) skip them the same way. Backend test added.

**Observed in the user's exports (for the builder)**
- Two layouts: header on row 1 with Tender/Ref/Amount groups and numeric Product IDs/dates; or 4
  title rows, header on row 5, text IDs/dates, `Line Discount`/`Transaction Discount` columns,
  footer rows. Headers contain line breaks (`Price\nID`, `Net\nTotal`).
- ~20–27% of lines have Price = 0 (free items with a small cost); refunds have Qty −1.
- Customer names/IDs and cardholder names (inside Payment/Tender) must not be shown in the new
  sections.

**Sample file**
- Upload card gets **Download sample Sales Report by Product (.xlsx)**: mock products in the POS
  column layout (incl. Price IDs `PL000013`, `PL000030`, `PS000015`, blanks; payments such as
  `BDO STRAIGHT` and `Cash`), so the full flow can be demonstrated without real data.

## Testing

- Domain: per-product summary from file names (no catalog), cost basis, Price ID comparison incl.
  POS price, export product import (dedupe, fallbacks, skips).
- E2E: the sidebar shows no "Sales report by product" item; Accounting downloads the sample, uploads it, calculates, sees bank results plus sections 05/06;
  Product Team price edit/deactivation flows through; Product Team imports products from the sample
  and adds one to a price book; `/sales-report` redirects to `/calculator`; existing calculator tests pass unchanged; Product Team still blocked from `/calculator`.
