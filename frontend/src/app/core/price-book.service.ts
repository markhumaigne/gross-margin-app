import { inject, Injectable, signal } from '@angular/core';
import {
  duplicatePriceBook,
  PriceBook,
  PriceBookDraft,
  savePriceBook,
  setPriceBookActive,
} from '../domain/price-books';
import { todayInManila } from '../domain/dates';
import { readSpreadsheet } from '../domain/read-spreadsheet';
import { fail, ok, Result } from '../domain/result';
import { hasPermission } from '../domain/roles';
import { importFromExport, ImportSummary } from '../domain/sales-import';
import { findHeaderRow, sheetSizeError, validateUploadFile } from '../domain/sales-report';
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

  /**
   * Imports products and price lists from a POS sales export (in memory for this session only).
   * Existing products and price book entries are never changed.
   */
  async importFromExport(actor: UserAccount, file: File): Promise<Result<ImportSummary>> {
    if (!hasPermission(actor.role, 'price-books')) return fail(NO_PERMISSION);
    const problem = validateUploadFile(file.name, file.size);
    if (problem) return fail(problem);
    let rows: unknown[][];
    try {
      rows = await readSpreadsheet(file);
    } catch {
      return fail('The file could not be read.');
    }
    const sizeError = sheetSizeError(rows, Math.max(findHeaderRow(rows), 0));
    if (sizeError) return fail(sizeError);
    const result = importFromExport(
      rows,
      file.name,
      todayInManila(),
      this.catalog.products(),
      this.store(),
      new Date(),
      actor.displayName,
    );
    if (!result.ok) return result;
    this.catalog.replaceAll(result.value.products);
    this.store.set(result.value.books);
    return ok(result.value.summary);
  }

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
