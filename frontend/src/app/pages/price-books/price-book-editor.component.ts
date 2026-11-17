import { Component, computed, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { AuthService } from '../../core/auth.service';
import { PriceBookService } from '../../core/price-book.service';
import { ProductCatalogService } from '../../core/product-catalog.service';
import { isIsoDate, todayInManila } from '../../domain/dates';
import { parseMoney } from '../../domain/money';
import {
  draftFromBook,
  emptyDraft,
  newEntryDraft,
  PriceBookDraft,
  PriceBookErrors,
  validatePriceBook,
} from '../../domain/price-books';
import {
  discountPercent,
  entryStatus,
  marginPercent,
  PriceBookEntryDraft,
} from '../../domain/pricing';
import { ProductPickerComponent } from './product-picker.component';

type Mode = 'create' | 'edit' | 'view';
type HeaderField = 'name' | 'description' | 'effectiveDate' | 'expirationDate';
type EntryField = 'updatedPrice' | 'promoPrice' | 'effectiveStart' | 'effectiveEnd' | 'memo';

const NO_ERRORS: PriceBookErrors = { entries: {}, form: [] };

function positive(text: string): number | null {
  const value = parseMoney(text);
  return value !== null && value > 0 ? value : null;
}

@Component({
  selector: 'app-price-book-editor',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, RouterLink, MatButtonModule, ProductPickerComponent],
  templateUrl: './price-book-editor.component.html',
})
export class PriceBookEditorComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly service = inject(PriceBookService);
  private readonly catalog = inject(ProductCatalogService);
  private readonly auth = inject(AuthService);
  readonly today = todayInManila();

  readonly mode = signal<Mode>('view');
  readonly bookId = signal<string | null>(null);
  readonly book = computed(() => {
    const id = this.bookId();
    return id ? this.service.byId(id) : undefined;
  });
  readonly notFound = computed(() => this.mode() !== 'create' && !this.book());
  readonly draft = signal<PriceBookDraft>(emptyDraft(this.today));
  private initialDraft = '';
  readonly attempted = signal(false);
  readonly pickerOpen = signal(false);
  readonly notice = signal('');
  readonly error = signal('');

  readonly errors = computed(() =>
    validatePriceBook(
      this.draft(),
      this.service.books(),
      this.catalog.products(),
      this.mode() === 'edit' ? this.bookId() : null,
    ),
  );
  readonly shownErrors = computed(() => (this.attempted() ? this.errors() : NO_ERRORS));
  readonly editable = computed(() => this.mode() !== 'view');
  readonly title = computed(() =>
    this.mode() === 'create'
      ? 'New price book'
      : this.mode() === 'edit'
        ? 'Edit price book'
        : (this.book()?.name ?? 'Price book'),
  );
  readonly rows = computed(() =>
    this.draft().entries.map((entry) => {
      const product = this.catalog.byId(entry.productId);
      const updated = positive(entry.updatedPrice);
      const promo = positive(entry.promoPrice);
      const price = promo ?? updated;
      const discount =
        product && price !== null ? discountPercent(product.masterListPrice, price) : null;
      const margin = product ? marginPercent(price ?? product.masterListPrice, product.cost) : null;
      return {
        entry,
        product,
        discount,
        margin,
        discountSource: promo !== null ? 'promo' : 'updated',
        status: isIsoDate(entry.effectiveStart)
          ? entryStatus(
              { effectiveStart: entry.effectiveStart, effectiveEnd: entry.effectiveEnd || null },
              this.today,
            )
          : null,
        errors: this.shownErrors().entries[entry.productId] ?? [],
      };
    }),
  );
  readonly productIds = computed(() => this.draft().entries.map((e) => e.productId));

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      this.mode.set((this.route.snapshot.data['mode'] as Mode | undefined) ?? 'view');
      this.bookId.set(params.get('id'));
      this.load();
      const notice = (history.state as { notice?: unknown } | null)?.notice;
      this.notice.set(typeof notice === 'string' ? notice : '');
    });
  }

  updateField(field: HeaderField, event: Event) {
    const value = (event.target as HTMLInputElement | HTMLTextAreaElement).value;
    this.draft.update((d) => {
      const next = { ...d, [field]: value };
      // Entries still using the book's previous validity dates follow the new ones.
      if (field === 'effectiveDate' || field === 'expirationDate') {
        const entryField = field === 'effectiveDate' ? 'effectiveStart' : 'effectiveEnd';
        next.entries = d.entries.map((e) =>
          e[entryField] === d[field] ? { ...e, [entryField]: value } : e,
        );
      }
      return next;
    });
  }

  updateStatus(event: Event) {
    const active = (event.target as HTMLSelectElement).value === 'active';
    this.draft.update((d) => ({ ...d, active }));
  }

  updateEntry(productId: string, field: EntryField, event: Event) {
    const value = (event.target as HTMLInputElement).value;
    this.draft.update((d) => ({
      ...d,
      entries: d.entries.map((e) => (e.productId === productId ? { ...e, [field]: value } : e)),
    }));
  }

  addProducts(ids: string[]) {
    this.draft.update((d) => ({
      ...d,
      entries: [...d.entries, ...ids.map((id) => newEntryDraft(id, d))],
    }));
    this.pickerOpen.set(false);
  }

  removeProduct(productId: string) {
    this.draft.update((d) => ({
      ...d,
      entries: d.entries.filter((e) => e.productId !== productId),
    }));
  }

  save() {
    this.attempted.set(true);
    const actor = this.auth.currentUser();
    if (!actor) return;
    const result = this.service.save(
      actor,
      this.draft(),
      this.mode() === 'edit' ? this.bookId() : null,
    );
    if (!result.ok) {
      this.notice.set('');
      this.error.set(result.error);
      return;
    }
    this.initialDraft = JSON.stringify(this.draft());
    void this.router.navigate(['/price-books', result.value.id], {
      state: { notice: `Price book ${result.value.id} saved.` },
    });
  }

  cancel() {
    if (this.isDirty() && !confirm('Discard unsaved changes?')) return;
    void this.router.navigate(
      this.mode() === 'edit' ? ['/price-books', this.bookId()] : ['/price-books'],
    );
  }

  duplicate() {
    const actor = this.auth.currentUser();
    const id = this.bookId();
    if (!actor || !id) return;
    const result = this.service.duplicate(actor, id);
    if (!result.ok) return this.error.set(result.error);
    void this.router.navigate(['/price-books', result.value.id], {
      state: { notice: `${result.value.id} created as an inactive copy of ${id}.` },
    });
  }

  toggleActive() {
    const actor = this.auth.currentUser();
    const book = this.book();
    if (!actor || !book) return;
    const result = this.service.setActive(actor, book.id, !book.active);
    if (!result.ok) return this.error.set(result.error);
    this.load();
    this.error.set('');
    this.notice.set(`${book.id} ${result.value.active ? 'activated' : 'deactivated'}.`);
  }

  formatDiscount(value: number | null): string {
    if (value === null) return '—';
    return value >= 0 ? `${value.toFixed(2)}%` : `+${(-value).toFixed(2)}% markup`;
  }

  entryLabel(field: string, entry: PriceBookEntryDraft) {
    return `${field} for ${entry.productId}`;
  }

  private load() {
    const book = this.book();
    this.draft.set(book && this.mode() !== 'create' ? draftFromBook(book) : emptyDraft(this.today));
    this.initialDraft = JSON.stringify(this.draft());
    this.attempted.set(false);
    this.error.set('');
    this.pickerOpen.set(false);
  }

  private isDirty() {
    return JSON.stringify(this.draft()) !== this.initialDraft;
  }
}
