import { inject, Injectable } from '@angular/core';
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
import { ProductCatalogService } from './product-catalog.service';
import { PricingWorkspaceService } from './pricing-workspace.service';

const NO_PERMISSION = 'You do not have permission to manage price books.';

/** Price books shared by demo accounts, persisted in this browser with the product catalog. */
@Injectable({ providedIn: 'root' })
export class PriceBookService {
  private readonly catalog = inject(ProductCatalogService);
  private readonly workspace = inject(PricingWorkspaceService);
  readonly books = this.workspace.books;
  readonly storageError = this.workspace.error;

  /**
   * Imports products and price lists from a POS sales export into shared browser storage.
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
    const loaded = this.workspace.reload();
    if (!loaded.ok) return loaded;
    const result = importFromExport(
      rows,
      file.name,
      todayInManila(),
      this.catalog.products(),
      this.books(),
      new Date(),
      actor.displayName,
    );
    if (!result.ok) return result;
    const saved = this.workspace.commit(result.value.books, result.value.products);
    if (!saved.ok) return saved;
    return ok(result.value.summary);
  }

  byId(id: string): PriceBook | undefined {
    return this.books().find((b) => b.id === id);
  }

  save(actor: UserAccount, draft: PriceBookDraft, editingId: string | null): Result<PriceBook> {
    if (!hasPermission(actor.role, 'price-books')) return fail(NO_PERMISSION);
    const loaded = this.workspace.reload();
    if (!loaded.ok) return loaded;
    const result = savePriceBook(
      this.books(),
      draft,
      editingId,
      this.catalog.products(),
      actor.displayName,
      new Date(),
    );
    if (!result.ok) return result;
    const saved = this.workspace.commit(result.value.books);
    if (!saved.ok) return saved;
    return ok(result.value.book);
  }

  duplicate(actor: UserAccount, id: string): Result<PriceBook> {
    if (!hasPermission(actor.role, 'price-books')) return fail(NO_PERMISSION);
    const loaded = this.workspace.reload();
    if (!loaded.ok) return loaded;
    const result = duplicatePriceBook(this.books(), id, actor.displayName, new Date());
    if (!result.ok) return result;
    const saved = this.workspace.commit(result.value.books);
    if (!saved.ok) return saved;
    return ok(result.value.book);
  }

  setActive(actor: UserAccount, id: string, active: boolean): Result<PriceBook> {
    if (!hasPermission(actor.role, 'price-books')) return fail(NO_PERMISSION);
    const loaded = this.workspace.reload();
    if (!loaded.ok) return loaded;
    const result = setPriceBookActive(this.books(), id, active, actor.displayName, new Date());
    if (!result.ok) return result;
    const saved = this.workspace.commit(result.value);
    if (!saved.ok) return saved;
    return ok(this.byId(id)!);
  }
}
