import { fail, ok, Result } from './result';
import { Role } from './roles';

/** Mock development account. Plaintext passwords are acceptable only in this prototype. */
export interface UserAccount {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  active: boolean;
  password: string;
}

export interface NewUserDraft {
  username: string;
  displayName: string;
  password: string;
  role: Role;
}

const USE_TRANSFER = 'Use "Transfer Accounting Head" to assign the Accounting Head role.';
const LAST_ADMIN = 'At least one active Admin account is required.';
const NOT_FOUND = 'Account not found.';

const sameUsername = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

function activeAdmins(users: readonly UserAccount[]): number {
  return users.filter((u) => u.role === 'admin' && u.active).length;
}

function replace(
  users: readonly UserAccount[],
  id: string,
  change: Partial<UserAccount>,
): UserAccount[] {
  return users.map((u) => (u.id === id ? { ...u, ...change } : u));
}

export function authenticate(
  users: readonly UserAccount[],
  username: string,
  password: string,
): Result<UserAccount> {
  if (!username.trim() || !password) return fail('Enter your username and password.');
  const user = users.find((u) => sameUsername(u.username, username));
  if (!user || user.password !== password) return fail('Invalid username or password.');
  if (!user.active) return fail('This account is inactive. Contact an Admin.');
  return ok(user);
}

export function accountingHead(users: readonly UserAccount[]): UserAccount | undefined {
  return users.find((u) => u.role === 'accounting-head');
}

export function addUser(users: readonly UserAccount[], draft: NewUserDraft): Result<UserAccount[]> {
  const username = draft.username.trim();
  if (!/^[a-z0-9._-]{3,32}$/i.test(username))
    return fail('Username must be 3–32 letters, numbers, dots, dashes or underscores.');
  if (users.some((u) => sameUsername(u.username, username)))
    return fail(`Username "${username}" is already taken.`);
  if (!draft.displayName.trim()) return fail('Display name is required.');
  if (draft.password.length < 8) return fail('Password must be at least 8 characters.');
  if (draft.role === 'accounting-head') return fail(USE_TRANSFER);
  const nextNumber = Math.max(0, ...users.map((u) => Number(u.id.replace(/^u-/, '')) || 0)) + 1;
  return ok([
    ...users,
    {
      id: 'u-' + nextNumber,
      username,
      displayName: draft.displayName.trim(),
      password: draft.password,
      role: draft.role,
      active: true,
    },
  ]);
}

export function changeRole(
  users: readonly UserAccount[],
  actorId: string,
  targetId: string,
  role: Role,
): Result<UserAccount[]> {
  const target = users.find((u) => u.id === targetId);
  if (!target) return fail(NOT_FOUND);
  if (role === 'accounting-head') return fail(USE_TRANSFER);
  if (target.role === 'accounting-head')
    return fail('Transfer the Accounting Head role to another account before changing this role.');
  if (target.role === role) return ok([...users]);
  if (actorId === targetId && target.role === 'admin')
    return fail('You cannot remove your own Admin role.');
  const next = replace(users, targetId, { role });
  if (activeAdmins(next) === 0) return fail(LAST_ADMIN);
  return ok(next);
}

export function transferAccountingHead(
  users: readonly UserAccount[],
  newHolderId: string,
  previousHolderRole: Exclude<Role, 'accounting-head'>,
): Result<UserAccount[]> {
  const holder = users.find((u) => u.id === newHolderId);
  if (!holder) return fail(NOT_FOUND);
  if (!holder.active) return fail('Inactive accounts cannot become Accounting Head.');
  if (holder.role === 'accounting-head')
    return fail(`${holder.displayName} is already the Accounting Head.`);
  const previous = accountingHead(users);
  let next = replace(users, newHolderId, { role: 'accounting-head' });
  if (previous) next = replace(next, previous.id, { role: previousHolderRole });
  if (activeAdmins(next) === 0) return fail(LAST_ADMIN);
  return ok(next);
}

export function setUserActive(
  users: readonly UserAccount[],
  actorId: string,
  targetId: string,
  active: boolean,
): Result<UserAccount[]> {
  const target = users.find((u) => u.id === targetId);
  if (!target) return fail(NOT_FOUND);
  if (!active) {
    if (actorId === targetId) return fail('You cannot deactivate your own account.');
    if (target.role === 'accounting-head')
      return fail('Transfer the Accounting Head role before deactivating this account.');
  }
  const next = replace(users, targetId, { active });
  if (activeAdmins(next) === 0) return fail(LAST_ADMIN);
  return ok(next);
}
