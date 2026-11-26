import 'reflect-metadata';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { test } from './harness';
import { authorize } from './helpers';
import { createApplication } from '../src/create-app';
import { AccountsRepository } from '../src/accounts/accounts.repository';
import { TokenService } from '../src/auth/token.service';
import { SIGN_IN_MESSAGES, UserAccount } from '../../shared/domain/user-accounts';

const admin: UserAccount = {
  id: 'u-1',
  username: 'admin',
  displayName: 'Demo Admin',
  role: 'admin',
  active: true,
};
const productTeam: UserAccount = {
  id: 'u-3',
  username: 'productteam',
  displayName: 'Demo Product Lead',
  role: 'product-team',
  active: true,
};

async function withApp(run: (app: Awaited<ReturnType<typeof createApplication>>) => Promise<void>) {
  process.env['AUTH_SECRET'] ||= 'test-secret-test-secret-test-secret-123';
  const app = await createApplication(true);
  await app.init();
  try {
    await run(app);
  } finally {
    await app.close();
  }
}

/** Sign-in lookup patched to one account whose password is `Admin123!` (cheap hash for speed). */
function knowAccount(
  app: { get: (t: typeof AccountsRepository) => AccountsRepository },
  account: UserAccount,
) {
  const passwordHash = bcrypt.hashSync('Admin123!', 4);
  app.get(AccountsRepository).findForSignIn = async (username) =>
    username.trim().toLowerCase() === account.username ? { account, passwordHash } : null;
}

test('API routes need a signed-in user', () =>
  withApp(async (app) => {
    const response = await request(app.getHttpServer()).get('/api/config/defaults').expect(401);
    assert.equal(response.body.message, 'Sign in again to continue.');
  }));

test('health is public', () =>
  withApp(async (app) => {
    const response = await request(app.getHttpServer()).get('/api/health').expect(200);
    assert.deepEqual(response.body, { status: 'ok' });
  }));

test('Product Team cannot use the calculator API', () =>
  withApp(async (app) => {
    const response = await request(app.getHttpServer())
      .get('/api/config/defaults')
      .set('Authorization', authorize(app, productTeam))
      .expect(403);
    assert.equal(
      response.body.message,
      'You do not have permission to use the bank rate calculator.',
    );
  }));

test("an inactive account's token is refused", () =>
  withApp(async (app) => {
    const header = authorize(app);
    app.get(AccountsRepository).findById = async () => ({ ...admin, active: false });
    await request(app.getHttpServer())
      .get('/api/config/defaults')
      .set('Authorization', header)
      .expect(401);
  }));

test('a token signed with another secret is refused', () =>
  withApp(async (app) => {
    authorize(app);
    const forged = jwt.sign({}, 'another-secret-another-secret-123456', {
      algorithm: 'HS256',
      subject: 'u-2',
      expiresIn: '12h',
    });
    await request(app.getHttpServer())
      .get('/api/config/defaults')
      .set('Authorization', 'Bearer ' + forged)
      .expect(401);
  }));

test('sign-in accepts any case and surrounding spaces in the username', () =>
  withApp(async (app) => {
    knowAccount(app, admin);
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: ' ADMIN ', password: 'Admin123!' })
      .expect(200);
    assert.equal(app.get(TokenService).verify(response.body.token), 'u-1');
    assert.deepEqual(response.body.user, admin);
    const text = JSON.stringify(response.body).toLowerCase();
    assert.ok(!text.includes('password'));
    assert.ok(!text.includes('passwordhash'));
  }));

test('sign-in messages match the old mock login', () =>
  withApp(async (app) => {
    knowAccount(app, admin);
    const login = (username: string, password: string) =>
      request(app.getHttpServer()).post('/api/auth/login').send({ username, password });
    assert.equal((await login('', '').expect(400)).body.message, SIGN_IN_MESSAGES.missing);
    assert.equal(
      (await login('admin', 'wrong').expect(401)).body.message,
      SIGN_IN_MESSAGES.invalid,
    );
    assert.equal(
      (await login('nobody', 'Admin123!').expect(401)).body.message,
      SIGN_IN_MESSAGES.invalid,
    );
    knowAccount(app, { ...admin, active: false });
    assert.equal(
      (await login('admin', 'Admin123!').expect(403)).body.message,
      SIGN_IN_MESSAGES.inactive,
    );
    assert.equal(
      (await login('admin', 'wrong').expect(401)).body.message,
      SIGN_IN_MESSAGES.invalid,
    );
  }));
