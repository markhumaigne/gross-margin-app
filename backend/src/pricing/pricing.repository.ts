import { Injectable } from '@nestjs/common';
import type { PriceBook, PricingSnapshot } from '../../../shared/domain/price-books';
import { bookFromRow, bookToRows, productFromRow } from '../database/mappers';
import { Db, PrismaService } from '../database/prisma.service';

@Injectable()
export class PricingRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Books by id (entries by position) and products by id. */
  async load(db: Db = this.prisma): Promise<PricingSnapshot> {
    const [books, products] = await Promise.all([
      db.priceBook.findMany({
        orderBy: { id: 'asc' },
        include: { entries: { orderBy: { position: 'asc' } } },
      }),
      db.product.findMany({ orderBy: { id: 'asc' } }),
    ]);
    return { books: books.map(bookFromRow), products: products.map(productFromRow) };
  }

  /** Rewrites only the given books (entries replaced wholesale) and removes the deleted ones. */
  async write(db: Db, changes: { upserts: PriceBook[]; deletes: string[] }): Promise<void> {
    if (changes.deletes.length > 0)
      await db.priceBook.deleteMany({ where: { id: { in: changes.deletes } } });
    for (const book of changes.upserts) {
      const rows = bookToRows(book);
      const { id, ...data } = rows.book;
      await db.priceBook.upsert({ where: { id }, create: rows.book, update: data });
      await db.priceBookEntry.deleteMany({ where: { priceBookId: id } });
      await db.priceBookEntry.createMany({ data: rows.entries });
    }
  }
}
