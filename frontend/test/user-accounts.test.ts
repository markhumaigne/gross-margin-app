import assert from 'node:assert/strict';
import { expectFail, expectOk, test } from './harness';
import {
  addUser,
  changeRole,
  setUserActive,
  transferAccountingHead,
  UserAccount,
} from '../../shared/domain/user-accounts';
import { SEED_USERS } from '../../shared/seed/users';

const heads = (u: readonly UserAccount[]) => u.filter((x) => x.role === 'accounting-head').length;

test('seed accounts match the development credentials', () => {
  assert.deepEqual(
    SEED_USERS.map((u) => [u.username, u.password, u.role]),
    [
      ['admin', 'Admin123!', 'admin'],
      ['accounting', 'Accounting123!', 'accounting-head'],
      ['productteam', 'Product123!', 'product-team'],
    ],
  );
  assert.equal(heads(SEED_USERS), 1);
});

test('transferring Accounting Head keeps exactly one holder and reassigns the previous one', () => {
  const next = expectOk(transferAccountingHead(SEED_USERS, 'u-1', 'u-3', 'product-team'));
  assert.equal(next.find((u) => u.id === 'u-3')!.role, 'accounting-head');
  assert.equal(next.find((u) => u.id === 'u-2')!.role, 'product-team');
  assert.equal(heads(next), 1);
  assert.equal(SEED_USERS[2].role, 'product-team');
});

test('Accounting Head cannot be duplicated or removed without a successor', () => {
  assert.match(
    expectFail(changeRole(SEED_USERS, 'u-1', 'u-3', 'accounting-head')),
    /Transfer Accounting Head/,
  );
  assert.match(
    expectFail(changeRole(SEED_USERS, 'u-1', 'u-2', 'product-team')),
    /before changing this role/,
  );
  assert.match(
    expectFail(
      addUser(SEED_USERS, {
        username: 'acct2',
        displayName: 'A',
        password: 'Password1',
        role: 'accounting-head',
      }),
    ),
    /Transfer Accounting Head/,
  );
  assert.match(expectFail(setUserActive(SEED_USERS, 'u-1', 'u-2', false)), /before deactivating/);
  assert.match(
    expectFail(transferAccountingHead(SEED_USERS, 'u-1', 'u-2', 'admin')),
    /already the Accounting Head/,
  );
});

test('the last active Admin is protected', () => {
  assert.equal(
    expectFail(changeRole(SEED_USERS, 'u-1', 'u-1', 'product-team')),
    'You cannot remove your own Admin role.',
  );
  assert.equal(
    expectFail(setUserActive(SEED_USERS, 'u-1', 'u-1', false)),
    'You cannot deactivate your own account.',
  );
  assert.equal(
    expectFail(transferAccountingHead(SEED_USERS, 'u-4', 'u-1', 'product-team')),
    'At least one active Admin account is required.',
  );
  const two = expectOk(
    addUser(SEED_USERS, {
      username: 'admin2',
      displayName: 'Second Admin',
      password: 'Password1',
      role: 'admin',
    }),
  );
  assert.equal(
    expectOk(changeRole(two, 'u-4', 'u-1', 'product-team')).find((u) => u.id === 'u-1')!.role,
    'product-team',
  );
});

test('addUser validates username, display name and password', () => {
  const draft = {
    username: 'pricing.lead',
    displayName: 'Pricing Lead',
    password: 'Password1',
    role: 'product-team' as const,
  };
  const added = expectOk(addUser(SEED_USERS, draft)).at(-1)!;
  assert.deepEqual([added.id, added.active], ['u-4', true]);
  assert.ok(!('password' in added));
  assert.equal(
    expectFail(addUser(SEED_USERS, { ...draft, username: 'ADMIN' })),
    'Username "ADMIN" is already taken.',
  );
  assert.match(expectFail(addUser(SEED_USERS, { ...draft, username: 'a b' })), /3–32 letters/);
  assert.equal(
    expectFail(addUser(SEED_USERS, { ...draft, password: 'short' })),
    'Password must be at least 8 characters.',
  );
  assert.equal(
    expectFail(addUser(SEED_USERS, { ...draft, displayName: ' ' })),
    'Display name is required.',
  );
});

test('an Admin cannot transfer Accounting Head to themselves', () => {
  const two = expectOk(
    addUser(SEED_USERS, {
      username: 'admin2',
      displayName: 'Second Admin',
      password: 'Password1',
      role: 'admin',
    }),
  );
  assert.equal(
    expectFail(transferAccountingHead(two, 'u-1', 'u-1', 'product-team')),
    'You cannot remove your own Admin role.',
  );
  assert.equal(
    expectFail(transferAccountingHead(SEED_USERS, 'u-1', 'u-1', 'admin')),
    'You cannot remove your own Admin role.',
  );
  assert.equal(
    expectOk(transferAccountingHead(two, 'u-4', 'u-1', 'product-team')).find((u) => u.id === 'u-1')!
      .role,
    'accounting-head',
  );
});
