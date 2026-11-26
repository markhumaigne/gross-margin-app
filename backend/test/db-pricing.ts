import 'reflect-metadata';
import assert from 'node:assert/strict';
import { ConflictException } from '@nestjs/common';
import { test } from './harness';
import { freshDb } from './db-helpers';
import { AccountsRepository } from '../src/accounts/accounts.repository';
import type { PrismaService } from '../src/database/prisma.service';
import { PricingRepository } from '../src/pricing/pricing.repository';
import { PricingService } from '../src/pricing/pricing.service';
import { draftFromBook, PriceBookDraft } from '../../shared/domain/price-books';
import { parseZenposPriceBook } from '../../shared/domain/zenpos-price-book';
import { SAMPLE_PRICE_BOOK_ROWS } from '../../frontend/src/app/mock-data/sample-price-book';

const setup = async () => {
  const db = await freshDb();
  const prisma = db as unknown as PrismaService;
  const actor = (await new AccountsRepository(prisma).findById('u-3'))!;
  return { db, actor, pricing: new PricingService(prisma, new PricingRepository(prisma)) };
};

const blankDraft = (values: Partial<PriceBookDraft>): PriceBookDraft => ({
  autoId: true,
  id: '',
  name: 'Draft',
  description: '',
  effectiveDate: '2026-11-01',
  expirationDate: '',
  active: true,
  entries: [],
  ...values,
});

test('a saved PS book reads back exactly', async () => {
  const { db, actor, pricing } = await setup();
  try {
    const { book } = await pricing.create(
      actor,
      blankDraft({
        autoId: false,
        id: 'PS000100',
        name: 'Support Promo',
        entries: [
          {
            productId: 'MAN-1',
            updatedPrice: '',
            promoPrice: '',
            effectiveStart: '2026-11-01',
            effectiveEnd: '2026-11-30',
            memo: 'manual row',
            support: '12.50',
            manual: {
              name: 'Manual Item',
              qty: '1',
              toQty: '',
              unit: 'PCS',
              masterListPrice: '1000',
              unitPrice: '900',
              discountPercent: '0',
              discount: '0',
              netPrice: '900',
              cost: '700',
            },
          },
        ],
      }),
    );
    assert.equal(book.entries[0].support, 12.5);
    const stored = (await pricing.snapshot()).books.find((b) => b.id === 'PS000100');
    assert.deepStrictEqual(stored, book);
  } finally {
    await db.$disconnect();
  }
});

test('a stale edit is refused', async () => {
  const { db, actor, pricing } = await setup();
  try {
    const original = (await pricing.snapshot()).books.find((b) => b.id === 'PL000013')!;
    const edit = (netPrice: string): PriceBookDraft => {
      const draft = draftFromBook(original);
      const entry = draft.entries[0];
      draft.entries[0] = {
        ...entry,
        updatedPrice: netPrice,
        manual: { ...entry.manual, netPrice },
      };
      return draft;
    };
    const price = 5000;
    const firstResult = await pricing.update(
      actor,
      'PL000013',
      edit(price.toFixed(2)),
      original.updatedAt,
    );
    await assert.rejects(
      pricing.update(actor, 'PL000013', edit((price - 1).toFixed(2)), original.updatedAt),
      (e: Error) =>
        e instanceof ConflictException &&
        e.message ===
          `Price book PL000013 was changed by ${actor.displayName} after you opened it. ` +
            'Your changes were not saved. Open the price book again to see the latest version.',
    );
    const stored = (await pricing.snapshot()).books.find((b) => b.id === 'PL000013')!;
    assert.equal(stored.entries[0].updatedPrice, price);
    assert.deepStrictEqual(stored, firstResult.book);
  } finally {
    await db.$disconnect();
  }
});

test('two new books saved at once both persist', async () => {
  const { db, actor, pricing } = await setup();
  try {
    await Promise.all([
      pricing.create(actor, blankDraft({ name: 'Alpha' })),
      pricing.create(actor, blankDraft({ name: 'Beta' })),
    ]);
    const ids = (await pricing.snapshot()).books.map((b) => b.id);
    assert.ok(ids.includes('PL000035'));
    assert.ok(ids.includes('PL000036'));
  } finally {
    await db.$disconnect();
  }
});

test('deleting a book removes its entries', async () => {
  const { db, pricing } = await setup();
  try {
    assert.ok((await db.priceBookEntry.count({ where: { priceBookId: 'PL000030' } })) > 0);
    const snapshot = await pricing.remove('PL000030');
    assert.ok(!snapshot.books.some((b) => b.id === 'PL000030'));
    assert.equal(await db.priceBookEntry.count({ where: { priceBookId: 'PL000030' } }), 0);
  } finally {
    await db.$disconnect();
  }
});

test('re-importing the same ZenPOS book changes nothing and keeps Support', async () => {
  const { db, actor, pricing } = await setup();
  try {
    const parsed = parseZenposPriceBook(SAMPLE_PRICE_BOOK_ROWS as unknown[][]);
    assert.ok(parsed.ok);
    await pricing.importBook(actor, 'sample.xlsx', parsed.value);
    const imported = (await pricing.snapshot()).books.find((b) => b.id === 'PS000015')!;
    const draft = draftFromBook(imported);
    draft.entries[0] = { ...draft.entries[0], support: '5.00' };
    await pricing.update(actor, 'PS000015', draft, imported.updatedAt);
    const again = await pricing.importBook(actor, 'sample.xlsx', parsed.value);
    assert.deepStrictEqual(
      {
        added: again.summary.added,
        removed: again.summary.removed,
        pricesChanged: again.summary.pricesChanged,
        supportKept: again.summary.supportKept,
      },
      { added: 0, removed: 0, pricesChanged: 0, supportKept: 1 },
    );
  } finally {
    await db.$disconnect();
  }
});
