import { inject, Injectable } from '@angular/core';
import {
  deletePriceBook,
  duplicatePriceBook,
  PriceBook,
  PriceBookDraft,
  savePriceBook,
  setPriceBookActive,
} from '../domain/price-books';
import { todayInManila } from '../domain/dates';
import { applyZenposPriceBook, BookImportSummary } from '../domain/price-book-import';
import { readSpreadsheet } from '../domain/read-spreadsheet';
import { fail, ok, Result } from '../domain/result';
import { hasPermission } from '../domain/roles';
import { validateUploadFile } from '../domain/sales-report';
import { UserAccount } from '../domain/user-accounts';
import { parseZenposPriceBook } from '../domain/zenpos-price-book';
import { ProductCatalogService } from './product-catalog.service';
import { PricingWorkspaceService } from './pricing-workspace.service';

const NO_PERMISSION = 'You do not have permission to manage price books.';

export type FileImportResult =
  | { fileName: string; ok: true; summary: BookImportSummary }
  | { fileName: string; ok: false; error: string };

/** Price books shared by demo accounts, persisted in this browser with the product catalog. */
@Injectable({ providedIn: 'root' })
export class PriceBookService {
  private readonly catalog = inject(ProductCatalogService);
  private readonly workspace = inject(PricingWorkspaceService);
  readonly books = this.workspace.books;
  readonly storageError = this.workspace.error;

  /**
   * Imports ZenPOS "Price Book" exports, one price book per file. Each file is saved on its own,
   * so a file that fails (unreadable, not a price book, or browser storage full) never stops the
   * others; its reason is reported instead.
   */
  async importPriceBooks(
    actor: UserAccount,
    files: readonly File[],
  ): Promise<Result<FileImportResult[]>> {
    if (!hasPermission(actor.role, 'price-books')) return fail(NO_PERMISSION);
    const results: FileImportResult[] = [];
    for (const file of files) {
      const result = await this.importOne(actor, file);
      results.push(
        result.ok
          ? { fileName: file.name, ok: true, summary: result.value }
          : { fileName: file.name, ok: false, error: result.error },
      );
    }
    return ok(results);
  }

  private async importOne(actor: UserAccount, file: File): Promise<Result<BookImportSummary>> {
    const problem = validateUploadFile(file.name, file.size);
    if (problem) return fail(problem);
    let rows: unknown[][];
    try {
      rows = await readSpreadsheet(file);
    } catch {
      return fail('The file could not be read.');
    }
    const parsed = parseZenposPriceBook(rows);
    if (!parsed.ok) return parsed;
    const loaded = this.workspace.reload();
    if (!loaded.ok) return loaded;
    const { books, summary } = applyZenposPriceBook(
      this.books(),
      parsed.value,
      file.name,
      todayInManila(),
      new Date(),
      actor.displayName,
    );
    const saved = this.workspace.commit(books);
    if (!saved.ok) return saved;
    return ok(summary);
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

  delete(actor: UserAccount, id: string): Result<void> {
    if (!hasPermission(actor.role, 'price-books')) return fail(NO_PERMISSION);
    const loaded = this.workspace.reload();
    if (!loaded.ok) return loaded;
    const result = deletePriceBook(this.books(), id);
    if (!result.ok) return result;
    return this.workspace.commit(result.value);
  }
}
