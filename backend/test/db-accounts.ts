import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from './harness';
import { freshDb } from './db-helpers';
import { AccountsRepository } from '../src/accounts/accounts.repository';
import { AccountsService } from '../src/accounts/accounts.service';
import { AuthService } from '../src/auth/auth.service';
import { TokenService } from '../src/auth/token.service';
import type { PrismaService } from '../src/database/prisma.service';
import { SEED_USERS } from '../../shared/seed/users';

const service = (db: unknown) => {
  const prisma = db as PrismaService;
  const repository = new AccountsRepository(prisma);
  return { accounts: new AccountsService(prisma, repository), repository };
};

const seedAccounts = () =>
  SEED_USERS.map(({ id, username, displayName, role, active }) => ({
    id,
    username,
    displayName,
    role,
    active,
  }));

test('transfer survives the one-holder index', async () => {
  const db = await freshDb();
  try {
    const { accounts, repository } = service(db);
    const admin = (await repository.findById('u-1'))!;
    await accounts.transferAccountingHead(admin, 'u-3', 'product-team');
    const users = await accounts.list();
    assert.equal(users.find((u) => u.id === 'u-3')?.role, 'accounting-head');
    assert.equal(users.find((u) => u.id === 'u-2')?.role, 'product-team');
  } finally {
    await db.$disconnect();
  }
});

test('an added account signs in and only its hash is stored', async () => {
  const db = await freshDb();
  try {
    const { accounts, repository } = service(db);
    const admin = (await repository.findById('u-1'))!;
    await accounts.add(admin, {
      username: 'cashier',
      displayName: 'Cashier',
      password: 'Cashier123!',
      role: 'product-team',
    });
    const auth = new AuthService(repository, new TokenService());
    assert.equal((await auth.signIn('cashier', 'Cashier123!')).user.username, 'cashier');
    const row = await db.user.findFirstOrThrow({ where: { username: 'cashier' } });
    assert.notEqual(row.passwordHash, 'Cashier123!');
  } finally {
    await db.$disconnect();
  }
});

test('domain refusals come back verbatim and change nothing', async () => {
  const db = await freshDb();
  try {
    const { accounts, repository } = service(db);
    const admin = (await repository.findById('u-1'))!;
    await assert.rejects(
      accounts.setActive(admin, 'u-1', false),
      (e: { status?: number; message?: string }) =>
        e.status === 400 && e.message === 'You cannot deactivate your own account.',
    );
    await assert.rejects(
      accounts.changeRole(admin, 'u-2', 'product-team'),
      (e: { status?: number; message?: string }) =>
        e.status === 400 &&
        e.message ===
          'Transfer the Accounting Head role to another account before changing this role.',
    );
    assert.deepEqual(await accounts.list(), seedAccounts());
  } finally {
    await db.$disconnect();
  }
});

test('simultaneous adds both persist with distinct ids', async () => {
  const db = await freshDb();
  try {
    const { accounts, repository } = service(db);
    const admin = (await repository.findById('u-1'))!;
    const draft = (username: string) => ({
      username,
      displayName: username,
      password: 'Password123!',
      role: 'product-team' as const,
    });
    await Promise.all([accounts.add(admin, draft('first')), accounts.add(admin, draft('second'))]);
    const users = await accounts.list();
    assert.equal(users.length, 5);
    assert.deepEqual(
      users.slice(3).map((u) => u.id),
      ['u-4', 'u-5'],
    );
  } finally {
    await db.$disconnect();
  }
});
