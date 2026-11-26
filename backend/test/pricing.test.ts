import 'reflect-metadata';
import assert from 'node:assert/strict';
import request from 'supertest';
import { test } from './harness';
import { authorize } from './helpers';
import { createApplication } from '../src/create-app';
import type { UserAccount } from '../../shared/domain/user-accounts';

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

test('Accounting cannot change price books', () =>
  withApp(async (app) => {
    const response = await request(app.getHttpServer())
      .post('/api/price-books')
      .set('Authorization', authorize(app))
      .send({})
      .expect(403);
    assert.equal(response.body.message, 'You do not have permission to manage price books.');
  }));

test('an import with a malformed Price ID is rejected before saving', () =>
  withApp(async (app) => {
    await request(app.getHttpServer())
      .post('/api/price-books/import')
      .set('Authorization', authorize(app, productTeam))
      .send({
        fileName: 'book.xlsx',
        book: {
          priceId: 'XX000001',
          name: 'Bad',
          active: true,
          memo: '',
          period: null,
          products: [],
          skippedRows: 0,
        },
      })
      .expect(400);
  }));
