import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { PriceBookService } from '../../core/price-book.service';
import { PricingWorkspaceService } from '../../core/pricing-workspace.service';
import { downloadSamplePriceBook } from '../../core/sample-download';
import { formatImportSummary } from '../../../../../shared/domain/price-book-import';
import { filterPriceBooks, PriceBook, StatusFilter } from '../../../../../shared/domain/price-books';

@Component({
  selector: 'app-price-book-list',
  standalone: true,
  imports: [DatePipe, RouterLink, MatButtonModule],
  templateUrl: './price-book-list.component.html',
})
export class PriceBookListComponent implements OnInit {
  private readonly service = inject(PriceBookService);
  private readonly workspace = inject(PricingWorkspaceService);
  readonly query = signal('');
  readonly status = signal<StatusFilter>('all');
  readonly books = computed(() =>
    filterPriceBooks(this.service.books(), this.query(), this.status()),
  );
  readonly notice = signal('');
  readonly error = signal('');
  /** One line per imported file; shown together with any files that failed. */
  readonly importedLines = signal<string[]>([]);
  readonly failedLines = signal<string[]>([]);
  readonly importing = signal(false);
  readonly busy = signal(false);

  async importFiles(event: Event) {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (!files.length) return;
    this.importing.set(true);
    try {
      const result = await this.service.importPriceBooks(files);
      if (!result.ok) return this.show(result.error, true);
      this.show('');
      this.importedLines.set(
        result.value.flatMap((r) =>
          r.ok ? [`${r.fileName}: ${formatImportSummary(r.summary)}`] : [],
        ),
      );
      this.failedLines.set(
        result.value.flatMap((r) => (r.ok ? [] : [`${r.fileName}: ${r.error}`])),
      );
    } finally {
      this.importing.set(false);
    }
  }

  downloadSample() {
    void downloadSamplePriceBook();
  }

  ngOnInit() {
    void this.workspace.reload();
    const notice = (history.state as { notice?: unknown } | null)?.notice;
    if (typeof notice === 'string') this.notice.set(notice);
  }

  setQuery(event: Event) {
    this.query.set((event.target as HTMLInputElement).value);
  }

  setStatus(event: Event) {
    this.status.set((event.target as HTMLSelectElement).value as StatusFilter);
  }

  async duplicate(book: PriceBook) {
    if (this.busy()) return;
    this.busy.set(true);
    let result;
    try {
      result = await this.service.duplicate(book.id);
    } finally {
      this.busy.set(false);
    }
    if (result.ok) this.show(`${result.value.id} created as an inactive copy of ${book.id}.`);
    else this.show(result.error, true);
  }

  async toggle(book: PriceBook) {
    if (this.busy()) return;
    this.busy.set(true);
    let result;
    try {
      result = await this.service.setActive(book.id, !book.active);
    } finally {
      this.busy.set(false);
    }
    if (result.ok) this.show(`${book.id} ${result.value.active ? 'activated' : 'deactivated'}.`);
    else this.show(result.error, true);
  }

  async remove(book: PriceBook) {
    if (this.busy()) return;
    if (!confirm(`Delete ${book.id} (${book.name})? This cannot be undone.`)) return;
    this.busy.set(true);
    let result;
    try {
      result = await this.service.delete(book.id);
    } finally {
      this.busy.set(false);
    }
    if (result.ok) this.show(`${book.id} deleted.`);
    else this.show(result.error, true);
  }

  private show(message: string, isError = false) {
    this.notice.set(isError ? '' : message);
    this.error.set(isError ? message : '');
    this.importedLines.set([]);
    this.failedLines.set([]);
  }
}
