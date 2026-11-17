import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { AuthService } from '../../core/auth.service';
import { PriceBookService } from '../../core/price-book.service';
import { downloadSampleExport } from '../../core/sample-download';
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
  readonly importing = signal(false);

  async importFile(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    const actor = this.auth.currentUser();
    if (!file || !actor) return;
    this.importing.set(true);
    try {
      const result = await this.service.importFromExport(actor, file);
      if (!result.ok) return this.show(result.error, true);
      const s = result.value;
      const created = s.booksCreated.length;
      const extended = s.booksExtended.length;
      this.show(
        `Imported ${s.productsAdded} products and ${created + extended} price lists from ` +
          `${s.fileName} (${created} new, ${extended} extended).`,
      );
    } finally {
      this.importing.set(false);
    }
  }

  downloadSample() {
    void downloadSampleExport();
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
  }
}
