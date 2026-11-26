import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import type { PriceBookImportResponse, PriceBookWriteResponse } from '../../../shared/api';
import { todayInManila } from '../../../shared/domain/dates';
import { applyZenposPriceBook } from '../../../shared/domain/price-book-import';
import {
  deletePriceBook,
  duplicatePriceBook,
  PriceBook,
  PriceBookDraft,
  PricingSnapshot,
  savePriceBook,
  setPriceBookActive,
} from '../../../shared/domain/price-books';
import type { Result } from '../../../shared/domain/result';
import type { UserAccount } from '../../../shared/domain/user-accounts';
import type { ZenposPriceBook } from '../../../shared/domain/zenpos-price-book';
import { diffBooks } from '../database/mappers';
import { lock, PRICING_LOCK, TX_OPTIONS } from '../database/locks';
import { PrismaService } from '../database/prisma.service';
import { PricingRepository } from './pricing.repository';

@Injectable()
export class PricingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingRepository,
  ) {}

  snapshot(): Promise<PricingSnapshot> {
    return this.pricing.load();
  }

  async create(actor: UserAccount, draft: PriceBookDraft): Promise<PriceBookWriteResponse> {
    const { book, pricing } = await this.write(({ books }) => {
      const result = savePriceBook(books, draft, null, actor.displayName, new Date());
      return result.ok ? { ok: true, value: { ...result.value, extra: null } } : result;
    });
    return { book: book as PriceBook, pricing };
  }

  async update(
    actor: UserAccount,
    id: string,
    draft: PriceBookDraft,
    expectedUpdatedAt?: string,
  ): Promise<PriceBookWriteResponse> {
    const { book, pricing } = await this.write(({ books }) => {
      const stored = books.find((b) => b.id === id);
      if (stored && expectedUpdatedAt !== undefined && stored.updatedAt !== expectedUpdatedAt)
        throw new ConflictException(
          `Price book ${id} was changed by ${stored.updatedBy} after you opened it. ` +
            'Your changes were not saved. Open the price book again to see the latest version.',
        );
      const result = savePriceBook(books, draft, id, actor.displayName, new Date());
      return result.ok ? { ok: true, value: { ...result.value, extra: null } } : result;
    });
    return { book: book as PriceBook, pricing };
  }

  async duplicate(actor: UserAccount, id: string): Promise<PriceBookWriteResponse> {
    const { book, pricing } = await this.write(({ books }) => {
      const result = duplicatePriceBook(books, id, actor.displayName, new Date());
      return result.ok ? { ok: true, value: { ...result.value, extra: null } } : result;
    });
    return { book: book as PriceBook, pricing };
  }

  async setActive(
    actor: UserAccount,
    id: string,
    active: boolean,
  ): Promise<PriceBookWriteResponse> {
    const { book, pricing } = await this.write(({ books }) => {
      const result = setPriceBookActive(books, id, active, actor.displayName, new Date());
      if (!result.ok) return result;
      const changed = result.value.find((b) => b.id === id) as PriceBook;
      return { ok: true, value: { books: result.value, book: changed, extra: null } };
    });
    return { book: book as PriceBook, pricing };
  }

  async remove(id: string): Promise<PricingSnapshot> {
    const { pricing } = await this.write(({ books }) => {
      const result = deletePriceBook(books, id);
      return result.ok
        ? { ok: true, value: { books: result.value, book: null, extra: null } }
        : result;
    });
    return pricing;
  }

  async importBook(
    actor: UserAccount,
    fileName: string,
    parsed: ZenposPriceBook,
  ): Promise<PriceBookImportResponse> {
    const now = new Date();
    const { extra, pricing } = await this.write(({ books }) => {
      const applied = applyZenposPriceBook(
        books,
        parsed,
        fileName,
        todayInManila(now),
        now,
        actor.displayName,
      );
      return {
        ok: true,
        value: { books: applied.books, book: applied.book, extra: applied.summary },
      };
    });
    return { summary: extra as PriceBookImportResponse['summary'], pricing };
  }

  /** Applies a domain change to the stored books under the pricing lock; a refusal changes nothing. */
  private write(
    change: (snapshot: PricingSnapshot) => Result<{
      books: PriceBook[];
      book: PriceBook | null;
      extra: unknown;
    }>,
  ): Promise<{ book: PriceBook | null; extra: unknown; pricing: PricingSnapshot }> {
    return this.prisma.$transaction(async (tx) => {
      await lock(tx, PRICING_LOCK);
      const before = await this.pricing.load(tx);
      const result = change(before);
      if (!result.ok) throw new BadRequestException(result.error);
      await this.pricing.write(tx, diffBooks(before.books, result.value.books));
      return {
        book: result.value.book,
        extra: result.value.extra,
        pricing: await this.pricing.load(tx),
      };
    }, TX_OPTIONS);
  }
}
