-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "on_hand" INTEGER,
    "master_list_price" DECIMAL(12,2) NOT NULL,
    "selling_price" DECIMAL(12,2) NOT NULL,
    "cost" DECIMAL(12,2),
    "source" TEXT,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_books" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "effective_date" DATE NOT NULL,
    "expiration_date" DATE,
    "active" BOOLEAN NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_by" TEXT NOT NULL,

    CONSTRAINT "price_books_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_book_entries" (
    "price_book_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "product_id" TEXT NOT NULL,
    "updated_price" DECIMAL(12,2),
    "promo_price" DECIMAL(12,2),
    "effective_start" DATE NOT NULL,
    "effective_end" DATE,
    "memo" TEXT NOT NULL DEFAULT '',
    "support" DECIMAL(12,2),
    "manual_name" TEXT,
    "manual_qty" DOUBLE PRECISION,
    "manual_to_qty" DOUBLE PRECISION,
    "manual_unit" TEXT,
    "manual_master_list_price" DECIMAL(12,2),
    "manual_unit_price" DECIMAL(12,2),
    "manual_discount_percent" DECIMAL(5,2),
    "manual_discount" DECIMAL(12,2),
    "manual_net_price" DECIMAL(12,2),
    "manual_cost" DECIMAL(12,2),

    CONSTRAINT "price_book_entries_pkey" PRIMARY KEY ("price_book_id","position")
);

-- AddForeignKey
ALTER TABLE "price_book_entries" ADD CONSTRAINT "price_book_entries_price_book_id_fkey" FOREIGN KEY ("price_book_id") REFERENCES "price_books"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------------------------
-- Hand-written: rules Prisma does not model.
-- ---------------------------------------------------------------------------------------------

ALTER TABLE "users" ADD CONSTRAINT "users_role_check"
  CHECK ("role" IN ('admin', 'accounting-head', 'product-team'));
ALTER TABLE "products" ADD CONSTRAINT "products_source_check"
  CHECK ("source" IS NULL OR "source" IN ('demo', 'import'));
ALTER TABLE "price_books" ADD CONSTRAINT "price_books_id_check"
  CHECK ("id" ~ '^(PL|PS|PI)[0-9]{6}$');
ALTER TABLE "price_books" ADD CONSTRAINT "price_books_name_check"
  CHECK (char_length("name") BETWEEN 1 AND 80);
-- Supplier Support only exists on PS (external promotion) price books.
ALTER TABLE "price_book_entries" ADD CONSTRAINT "price_book_entries_support_check"
  CHECK ("support" IS NULL OR "price_book_id" LIKE 'PS%');
-- Manual/ZenPOS product details are all present or all absent (to Qty is optional).
ALTER TABLE "price_book_entries" ADD CONSTRAINT "price_book_entries_manual_check"
  CHECK (num_nonnulls("manual_name", "manual_qty", "manual_unit", "manual_master_list_price",
    "manual_unit_price", "manual_discount_percent", "manual_discount", "manual_net_price",
    "manual_cost") IN (0, 9)
    AND ("manual_to_qty" IS NULL OR "manual_name" IS NOT NULL));

CREATE UNIQUE INDEX "users_username_lower_key" ON "users" (lower("username"));
CREATE UNIQUE INDEX "users_one_accounting_head_key" ON "users" ("role")
  WHERE "role" = 'accounting-head';
CREATE UNIQUE INDEX "price_books_name_lower_key" ON "price_books" (lower("name"));
CREATE UNIQUE INDEX "price_book_entries_book_product_key"
  ON "price_book_entries" ("price_book_id", upper("product_id"));

-- Supabase exposes "public" through its Data API. RLS with no policies denies the anon and
-- authenticated keys; Prisma connects as the table owner, which RLS does not restrict.
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "products" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "price_books" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "price_book_entries" ENABLE ROW LEVEL SECURITY;
