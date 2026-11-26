-- The product catalog was removed from the app: price book entries carry their own product details
-- (ZenPOS import or manual entry). IF EXISTS: the table may already have been dropped by hand.
DROP TABLE IF EXISTS "products";
