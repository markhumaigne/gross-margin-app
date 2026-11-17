import { inject, Injectable, signal } from '@angular/core';
import {
  duplicatePriceBook,
  PriceBook,
  PriceBookDraft,
  savePriceBook,
  setPriceBookActive,
} from '../domain/price-books';
import { fail, ok, Result } from '../domain/result';
import { hasPermission } from '../domain/roles';
import { UserAccount } from '../domain/user-accounts';
import { SEED_PRICE_BOOKS } from '../mock-data/price-books';
import { ProductCatalogService } from './product-catalog.service';

const NO_PERMISSION = 'You do not have permission to manage price books.';

/** In-memory price book store. Replace with an API-backed service when a backend exists. */
@Injectable({ providedIn: 'root' })
export class PriceBookService {
  private readonly catalog = inject(ProductCatalogService);
  private readonly store = signal<readonly PriceBook[]>(SEED_PRICE_BOOKS);
  readonly books = this.store.asReadonly();

  byId(id: string): PriceBook | undefined {
    return this.store().find((b) => b.id === id);
  }

  save(actor: UserAccount, draft: PriceBookDraft, editingId: string | null): Result<PriceBook> {
    if (!hasPermission(actor.role, 'price-books')) return fail(NO_PERMISSION);
    const result = savePriceBook(
      this.store(),
      draft,
      editingId,
      this.catalog.products(),
      actor.displayName,
      new Date(),
    );
    if (!result.ok) return result;
    this.store.set(result.value.books);
    return ok(result.value.book);
  }

  duplicate(actor: UserAccount, id: string): Result<PriceBook> {
    if (!hasPermission(actor.role, 'price-books')) return fail(NO_PERMISSION);
    const result = duplicatePriceBook(this.store(), id, actor.displayName, new Date());
    if (!result.ok) return result;
    this.store.set(result.value.books);
    return ok(result.value.book);
  }

  setActive(actor: UserAccount, id: string, active: boolean): Result<PriceBook> {
    if (!hasPermission(actor.role, 'price-books')) return fail(NO_PERMISSION);
    const result = setPriceBookActive(this.store(), id, active, actor.displayName, new Date());
    if (!result.ok) return result;
    this.store.set(result.value);
    return ok(this.byId(id)!);
  }
}
