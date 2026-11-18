# Click a product to edit it (short design)

**Why:** Editing one product in a price book took five steps (open → Edit → row Edit → Save product → Save price book). The boss wants editing to be easy: click the product and change it.

**Design (approved by the user):**
- **Click a row while viewing:** the price book opens in edit mode, scrolled to that product with its first field focused. Nothing is kept until **Save price book**; **Cancel** discards.
- **Edit on the side of a row** (edit mode): opens the product window with all of the row's info: details, prices, cost, Support (PS books), plus **Effective start**, **Effective end** and **Memo**, which are new to the window. **Save product** updates the row; **Save price book** saves it.
- **Demo catalog rows** (seed books' original products) keep inline editing of prices, dates, memo and Support, and get no Edit button, because their details come from the shared catalog. ZenPOS-imported and manual rows get the full Edit.

**Approaches:** Saving straight from view mode was rejected by the user, who wants a single Save price book step. Opening the product window on row click was rejected because it adds a step for quick Support or date changes.

**Non-goals:** No changes to validation, storage or the calculator. Date and memo errors keep showing on the row in the table, as today.

**Left to the builder:** The hover and cursor styling for clickable rows. Keyboard access: rows are focusable and open on Enter.
