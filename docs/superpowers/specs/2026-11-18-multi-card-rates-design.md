# Centavo rounding and per-card rate columns (short design)

**Why:** Large ZenPOS receipts are held for review and get no bank charge, because the payments and the sum of the receipt's item net totals differ by ₱0.01. ZenPOS rounds each item separately. In Nov 1–17 this blocked 4 card receipts (53 rows), for example PAYMAYA CREDIT ₱78,510.00 on invoice 3056-00009846. Accounting also wants to see each card's rate separately when a customer pays with several cards.

**Approved design**
- **Rounding:**
  - A receipt whose explicit payments differ from its item net totals by no more than **₱0.01 per item row on the receipt** is calculated normally.
  - Bank charges use the exact payment amounts. The Calculation Explanation notes the rounding difference.
  - Larger differences are still held for review, as today.
- **Rate columns:**
  - The single **Applied Bank Rate** column is replaced by **Applied Bank Rate 1**, **Applied Bank Rate 2** and **Applied Bank Rate 3**. Each holds one card's configured rate as a number (percent format), in the same order as the cards in **Tender**.
  - **Bank Charges / Subsidy** stays the total for all cards.
  - The calculated report has **21 columns**: `Product ID · Sales Date · Branch · Invoice Number · Product Name · Price ID · Quantity · Price · Cost · Supplier Support · Discount · Line Total · Payment · Applied Bank Rate 1 · Applied Bank Rate 2 · Applied Bank Rate 3 · Bank Charges / Subsidy · GrossMargin · Sales Source Row · Tender · Calculation Explanation`

**Approaches considered:**
- **A fixed ₱1 tolerance** was rejected. It could hide a real ₱0.90 shortfall, while per-row rounding can never exceed ₱0.005 per row.
- **Card name + rate as text** in each column was rejected by the user, who wants numbers that Excel can filter and sort.

**Not changed:**
- Cash-only receipts with change still go to Needs Review; they carry no bank charge.
- Unconfigured payment methods (for example GCASH) still make a receipt a partial calculation until they are configured.

**Left to the builder:** What happens with more than three cards (none in the data): the 4th and later cards' rates appear in the Calculation Explanation, which already lists every matched card and rate. *(My call.)*
