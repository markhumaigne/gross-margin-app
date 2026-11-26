import 'reflect-metadata';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { test } from './harness';
import { freshDb } from './db-helpers';
import { AccountsRepository } from '../src/accounts/accounts.repository';
import { AuthService } from '../src/auth/auth.service';
import { TokenService } from '../src/auth/token.service';
import type { PrismaService } from '../src/database/prisma.service';
import { SIGN_IN_MESSAGES } from '../../shared/domain/user-accounts';

test('sign-in matches the exact username, not a pattern', async () => {
  const db = await freshDb();
  try {
    for (const [id, username, password] of [
      ['x-1', 'a_b', 'Password-ab1'],
      ['x-2', 'axb', 'Password-axb2'],
    ])
      await db.user.create({
        data: {
          id,
          username,
          displayName: username,
          passwordHash: await bcrypt.hash(password, 4),
          role: 'product-team',
        },
      });
    const auth = new AuthService(
      new AccountsRepository(db as unknown as PrismaService),
      new TokenService(),
    );
    assert.equal((await auth.signIn('A_B', 'Password-ab1')).user.id, 'x-1');
    assert.equal((await auth.signIn(' AXB ', 'Password-axb2')).user.id, 'x-2');
    await assert.rejects(
      auth.signIn('a\\', 'whatever1'),
      (e: { status?: number; message?: string }) =>
        e.status === 401 && e.message === SIGN_IN_MESSAGES.invalid,
    );
    await assert.rejects(
      auth.signIn('%', 'whatever1'),
      (e: { status?: number }) => e.status === 401,
    );
  } finally {
    await db.$disconnect();
  }
});
