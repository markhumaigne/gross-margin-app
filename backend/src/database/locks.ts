import type { Prisma } from '../generated/prisma/client';

export const USERS_LOCK = 41001;
export const PRICING_LOCK = 41002;
export const TX_OPTIONS = { maxWait: 10_000, timeout: 30_000 };

/** Transaction-scoped advisory lock; `$executeRaw` because `$queryRaw` cannot read `void`. */
export async function lock(tx: Prisma.TransactionClient, key: number): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${key})`;
}
