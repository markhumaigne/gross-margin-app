# Price ID and Supplier Support in the calculated report (short design)

**Why:** Accounting needs to see, per sale, which price list the POS applied and the supplier Support earned on PS promotions. GrossMargin must include that Support, because Support changes what the business earns (user's decision: option A).

**Approved design**
- **Two new columns.** The calculated report has 19 columns, in both the on-screen table and the Excel "Item Bank Deductions" sheet:
  `Product ID · Sales Date · Branch · Invoice Number · Product Name · Price ID · Quantity · Price · Cost · Supplier Support · Discount · Line Total · Payment · Applied Bank Rate · Bank Charges / Subsidy · GrossMargin · Sales Source Row · Tender · Calculation Explanation`
- **Price ID** is the sale's Price ID as recorded by the POS (normalized to upper case), or blank.
- **Supplier Support** = Support (₱ per unit) × quantity, when the sale's Price ID is a PS price book that lists the product.
  - It uses the same rules as the calculator's product section (05): inactive PS books still count, and rows with a net Line Total of ₱0 or less earn none.
- **GrossMargin** = Line Total − Cost − Bank Charges / Subsidy + Supplier Support.
  - The Calculation Explanation names it, e.g. "+ ₱1,000.00 supplier support (PS000015: ₱500.00 × 2)".
  - The Gross Margin by Branch & Date totals and the summary gross margin include it, because they sum GrossMargin.
- **How the data gets there:** when the user clicks **Calculate**, the browser sends the Support list from every PS price book (`{ priceId, productId, support }`, PS entries with Support only). The server reads the sales file's Price ID column and matches rows by Price ID + Product ID (case-insensitive, trimmed).

**Approaches considered:** Adding the columns in the browser after calculation was rejected, because the signed export would refuse a changed result. Storing price books on the server was rejected, because there is no database.

**Unchanged rules:**
- **Bank-payment rows only:** cash-only and other no-charge rows still don't appear in this report, so their Support shows only in section 05.
- **Missing cost:** a blank GrossMargin (missing cost, cash, unresolved) stays blank. Supplier Support still shows on the row.
- **Price book changes:** the report is computed by the server, so changing Support needs a new **Calculate**. Section 05 still updates live.

**Non-goals:**
- No Supplier Support column on the Branch & Date sheet.
- No Support for PL or PI.
- No change to bank-charge rules.

**Left to the builder:** The request validation limits for the Support list (it must fit the existing 1 MB multipart field limit). The Explanation wording.
