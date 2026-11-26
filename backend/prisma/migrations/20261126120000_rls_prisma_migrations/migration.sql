-- Make row level security on Prisma's own bookkeeping table explicit (no-op where Supabase already enabled it).
ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;
