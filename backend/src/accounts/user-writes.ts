import type { UserAccount } from '../../../shared/domain/user-accounts';

export interface UserWrites {
  demotions: UserAccount[];
  updates: UserAccount[];
  inserts: UserAccount[];
}

/**
 * Splits a change of the account list into the writes that apply it. Accounts leaving
 * `accounting-head` are written first so the one-holder index is never violated mid-transaction.
 */
export function planUserWrites(
  before: readonly UserAccount[],
  after: readonly UserAccount[],
): UserWrites {
  const previous = new Map(before.map((u) => [u.id, u]));
  const plan: UserWrites = { demotions: [], updates: [], inserts: [] };
  for (const user of after) {
    const old = previous.get(user.id);
    if (!old) plan.inserts.push(user);
    else if (
      old.username !== user.username ||
      old.displayName !== user.displayName ||
      old.role !== user.role ||
      old.active !== user.active
    )
      (old.role === 'accounting-head' && user.role !== 'accounting-head'
        ? plan.demotions
        : plan.updates
      ).push(user);
  }
  return plan;
}
