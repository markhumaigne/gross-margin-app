import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { AuthService } from '../../core/auth.service';
import { PriceBookService } from '../../core/price-book.service';
import { downloadSamplePriceBook } from '../../core/sample-download';
import { formatImportSummary } from '../../domain/price-book-import';
import { filterPriceBooks, PriceBook, StatusFilter } from '../../domain/price-books';

@Component({
  selector: 'app-price-book-list',
  standalone: true,
  imports: [DatePipe, RouterLink, MatButtonModule],
  templateUrl: './price-book-list.component.html',
})
export class PriceBookListComponent implements OnInit {
  private readonly service = inject(PriceBookService);
  private readonly auth = inject(AuthService);
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

  async importFiles(event: Event) {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    const actor = this.auth.currentUser();
    if (!files.length || !actor) return;
    this.importing.set(true);
    try {
      const result = await this.service.importPriceBooks(actor, files);
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
    const notice = (history.state as { notice?: unknown } | null)?.notice;
    if (typeof notice === 'string') this.notice.set(notice);
  }

  setQuery(event: Event) {
    this.query.set((event.target as HTMLInputElement).value);
  }

  setStatus(event: Event) {
    this.status.set((event.target as HTMLSelectElement).value as StatusFilter);
  }

  duplicate(book: PriceBook) {
    const actor = this.auth.currentUser();
    if (!actor) return;
    const result = this.service.duplicate(actor, book.id);
    if (result.ok) this.show(`${result.value.id} created as an inactive copy of ${book.id}.`);
    else this.show(result.error, true);
  }

  toggle(book: PriceBook) {
    const actor = this.auth.currentUser();
    if (!actor) return;
    const result = this.service.setActive(actor, book.id, !book.active);
    if (result.ok) this.show(`${book.id} ${result.value.active ? 'activated' : 'deactivated'}.`);
    else this.show(result.error, true);
  }

  private show(message: string, isError = false) {
    this.notice.set(isError ? '' : message);
    this.error.set(isError ? message : '');
    this.importedLines.set([]);
    this.failedLines.set([]);
  }
}
