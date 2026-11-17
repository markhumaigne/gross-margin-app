# Price Book Persistence Fix

**Goal:** Saved product prices remain available to Accounting after reload, account changes, and across tabs in the same browser/profile and origin.

**Root cause:** PriceBookService and ProductCatalogService initialize independent in-memory signals from demo seeds on every page load. Accounting in a new page has no saved/imported books. Reproduced with two browser tests: save/reload/sign in to Accounting, and save while another Accounting tab already has calculated results. Both display Price ID not found instead of expected revenue 5000 and variance 590.

**Implementation choice:** A versioned localStorage snapshot containing books and catalog together, shared by the existing services. No authentication changes or transaction storage. The user clarified this is a database-free demo to picture the connected workflow; browser persistence is sufficient. Separate profiles/computers would require server storage.

- [x] Add and run failing browser regressions for reload and live tab synchronization.
- [x] Test and implement snapshot serialization/validation and write failures; retain all manual fields and imported products.
- [x] Add a shared reactive pricing store. Persist before reporting successful mutations; publish cross-tab storage updates; reread before mutations. Never overwrite invalid stored data silently.
- [x] Update price-book/catalog services, storage messaging, and documentation.
- [x] Test import persistence, manual-price calculations, blocked storage, build, and full browser suite; review changes.

**Verification:** Backend 77/77 and frontend 65/65 checks passed. Production build passed. Browser suite: 46 passed, 1 pre-existing test skipped because SAMPLE_SALES is not configured. New coverage verifies saved manual prices after reload/account switch, live updates in another Accounting tab, imported products/books after reload, full-storage failure without false success (and successful retry), and preservation of unreadable stored data.

**Review:** Independent review identified automatic IDs overflowing after PL999999, which could save a snapshot the reader would reject. Reproduced with failing tests. The allocator now uses unused six-digit IDs when the maximum is reached, and storage validates snapshots before replacing existing data. Regressions verify create/duplicate remain reloadable and invalid writes preserve previous saved data. Cross-profile/server sharing and concurrent edit conflict resolution remain outside the local demo scope.
