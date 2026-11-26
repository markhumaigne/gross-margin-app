import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom, Observable } from 'rxjs';
import type {
  PriceBookImportRequest,
  PriceBookImportResponse,
  PriceBookWriteResponse,
  SavePriceBookRequest,
} from '../../../../shared/api';
import { PriceBook, PriceBookDraft, PricingSnapshot } from '../../../../shared/domain/price-books';
import { BookImportSummary } from '../../../../shared/domain/price-book-import';
import { readSpreadsheet } from '../domain/read-spreadsheet';
import { fail, ok, Result } from '../../../../shared/domain/result';
import { validateUploadFile } from '../domain/sales-report';
import { parseZenposPriceBook } from '../../../../shared/domain/zenpos-price-book';
import { apiResult } from './api-result';
import { PricingWorkspaceService } from './pricing-workspace.service';

export type FileImportResult =
  | { fileName: string; ok: true; summary: BookImportSummary }
  | { fileName: string; ok: false; error: string };

/** Price books shared by all accounts, stored by the API. */
@Injectable({ providedIn: 'root' })
export class PriceBookService {
  private readonly http = inject(HttpClient);
  private readonly workspace = inject(PricingWorkspaceService);
  readonly books = this.workspace.books;
  readonly loadError = this.workspace.error;

  /**
   * Imports ZenPOS "Price Book" exports, one price book per file. Each file is parsed in the
   * browser and sent on its own, so a file that fails never stops the others; its reason is
   * reported instead.
   */
  async importPriceBooks(files: readonly File[]): Promise<Result<FileImportResult[]>> {
    const results: FileImportResult[] = [];
    for (const file of files) {
      const result = await this.importOne(file);
      results.push(
        result.ok
          ? { fileName: file.name, ok: true, summary: result.value }
          : { fileName: file.name, ok: false, error: result.error },
      );
    }
    return ok(results);
  }

  private async importOne(file: File): Promise<Result<BookImportSummary>> {
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
    const body: PriceBookImportRequest = { fileName: file.name, book: parsed.value };
    const result = await apiResult(
      firstValueFrom(this.http.post<PriceBookImportResponse>('/api/price-books/import', body)),
    );
    if (!result.ok) return result;
    this.workspace.apply(result.value.pricing);
    return ok(result.value.summary);
  }

  byId(id: string): PriceBook | undefined {
    return this.books().find((b) => b.id === id);
  }

  save(
    draft: PriceBookDraft,
    editingId: string | null,
    expectedUpdatedAt?: string,
  ): Promise<Result<PriceBook>> {
    if (editingId === null) {
      return this.written(this.http.post<PriceBookWriteResponse>('/api/price-books', draft));
    }
    const body: SavePriceBookRequest = expectedUpdatedAt
      ? { draft, expectedUpdatedAt }
      : { draft };
    return this.written(
      this.http.put<PriceBookWriteResponse>(
        `/api/price-books/${encodeURIComponent(editingId)}`,
        body,
      ),
    );
  }

  duplicate(id: string): Promise<Result<PriceBook>> {
    return this.written(
      this.http.post<PriceBookWriteResponse>(
        `/api/price-books/${encodeURIComponent(id)}/duplicate`,
        {},
      ),
    );
  }

  setActive(id: string, active: boolean): Promise<Result<PriceBook>> {
    return this.written(
      this.http.patch<PriceBookWriteResponse>(
        `/api/price-books/${encodeURIComponent(id)}/active`,
        { active },
      ),
    );
  }

  async delete(id: string): Promise<Result<void>> {
    const result = await apiResult(
      firstValueFrom(
        this.http.delete<PricingSnapshot>(`/api/price-books/${encodeURIComponent(id)}`),
      ),
    );
    if (!result.ok) return result;
    this.workspace.apply(result.value);
    return ok(undefined);
  }

  private async written(request: Observable<PriceBookWriteResponse>): Promise<Result<PriceBook>> {
    const result = await apiResult(firstValueFrom(request));
    if (!result.ok) return result;
    this.workspace.apply(result.value.pricing);
    return ok(result.value.book);
  }
}
