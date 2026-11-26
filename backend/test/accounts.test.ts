import assert from 'node:assert/strict';
import { test } from './harness';
import { planUserWrites } from '../src/accounts/user-writes';
import { SEED_USERS } from '../../shared/seed/users';
import { addUser, transferAccountingHead, UserAccount } from '../../shared/domain/user-accounts';

const accounts = (): UserAccount[] =>
  SEED_USERS.map(({ id, username, displayName, role, active }) => ({
    id,
    username,
    displayName,
    role,
    active,
  }));

function value<T>(result: { ok: true; value: T } | { ok: false; error: string }): T {
  assert.ok(result.ok);
  return result.value;
}

test('planUserWrites demotes the previous Accounting Head first', () => {
  const before = accounts();
  const transferred = value(transferAccountingHead(before, 'u-1', 'u-3', 'product-team'));
  const plan = planUserWrites(before, transferred);
  assert.deepEqual(plan.demotions, [{ ...before[1], role: 'product-team' }]);
  assert.deepEqual(plan.updates, [{ ...before[2], role: 'accounting-head' }]);
  assert.deepEqual(plan.inserts, []);

  const added = value(
    addUser(before, {
      username: 'cashier',
      displayName: 'Cashier',
      password: 'Cashier123!',
      role: 'product-team',
    }),
  );
  const addedPlan = planUserWrites(before, added);
  assert.deepEqual(addedPlan.demotions, []);
  assert.deepEqual(addedPlan.updates, []);
  assert.deepEqual(addedPlan.inserts, [added[added.length - 1]]);
});
