# Manual price book products

Add products opens a manual form for Product ID, Name, Qty, to Qty, Unit, Master List Price, Unit Price, Disc %, Discount, Net Price, Cost, and Margin. Catalog selection stays available through a second tab. All requested values are manually editable and preserved; no calculation overwrites them.

Implementation choices: Qty and to Qty are inclusive quantity bounds (positive decimal quantities; blank to Qty means no upper limit). Disc % and Margin are percentages. Amounts use the existing two-decimal money parser; zero prices and negative margins are allowed. Net Price is the effective price used by existing price-book lookups. Validation rejects missing identity, invalid numbers, reversed quantity bounds, and duplicate product IDs within a book.

Manual data belongs to the price-book entry and never mutates the shared catalog. Entries inherit book validity dates and support save, view, edit, remove, and duplicate using the existing in-memory lifecycle. The products table shows the requested fields in order, followed by existing catalog price overrides and validity/memo fields.

Approaches considered: storing new products in the catalog would introduce global side effects on cancel and on other books. Storing manual details on entries keeps the change local to the requested price book, so that is the implementation choice. Existing Angular components and styles are reused, with no dependencies or deployment changes.
