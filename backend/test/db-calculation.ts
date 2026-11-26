import 'reflect-metadata';
import assert from 'node:assert/strict';
import { Client } from 'pg';
import request from 'supertest';
import { test } from './harness';
import { freshDb } from './db-helpers';
import { reportFixture } from './helpers';
import { createApplication } from '../src/create-app';
import { TEST_DB } from './db-settings';

test('a calculation writes nothing to the database', async () => {
  const db = await freshDb();
  const app = await createApplication(true);
  await app.init();
  try {
    const counts = async () => [
      await db.user.count(),
      await db.priceBook.count(),
      await db.priceBookEntry.count(),
    ];
    const before = await counts();
    const server = app.getHttpServer();
    const login = await request(server)
      .post('/api/auth/login')
      .send({ username: 'accounting', password: 'Accounting123!' })
      .expect(200);
    const auth = 'Bearer ' + login.body.token;
    const buf = reportFixture();
    const preview = await request(server)
      .post('/api/excel/preview')
      .set('Authorization', auth)
      .attach('file', buf, 'sales.xlsx')
      .expect(201);
    const sheet = preview.body.sheets[0];
    const defaults = await request(server)
      .get('/api/config/defaults')
      .set('Authorization', auth)
      .expect(200);
    const calculated = await request(server)
      .post('/api/excel/calculate')
      .set('Authorization', auth)
      .field(
        'options',
        JSON.stringify({
          sales: { sheet: sheet.name, headerRow: sheet.headerRow, mapping: sheet.suggestedMapping },
          configuration: defaults.body,
        }),
      )
      .attach('sales', buf, 'sales.xlsx')
      .expect(201);
    await request(server)
      .post('/api/excel/export')
      .set('Authorization', auth)
      .send(calculated.body)
      .expect(201);
    assert.deepEqual(await counts(), before);

    const url = new URL(TEST_DB.directUrl);
    url.searchParams.delete('schema');
    const client = new Client({ connectionString: url.toString() });
    await client.connect();
    try {
      const { rows } = await client.query(
        'SELECT table_name FROM information_schema.tables WHERE table_schema = $1 ORDER BY table_name',
        [TEST_DB.schema],
      );
      assert.deepEqual(
        rows.map((r) => r.table_name),
        ['_prisma_migrations', 'price_book_entries', 'price_books', 'users'],
      );
    } finally {
      await client.end();
    }
  } finally {
    await app.close();
    await db.$disconnect();
  }
});
