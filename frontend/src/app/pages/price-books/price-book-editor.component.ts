import { Component, computed, effect, ElementRef, inject, signal, untracked } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { PriceBookService } from '../../core/price-book.service';
import { PricingWorkspaceService } from '../../core/pricing-workspace.service';
import { isIsoDate, todayInManila } from '../../../../../shared/domain/dates';
import { parseMoney } from '../../../../../shared/domain/money';
import { ManualProductDraft, MANUAL_PRODUCT_FIELDS } from '../../../../../shared/domain/manual-products';
import {
  draftFromBook,
  emptyDraft,
  nextPriceBookId,
  isSupportBook,
  normalizePriceId,
  PriceBookDraft,
  PriceBookErrors,
  validatePriceBook,
} from '../../../../../shared/domain/price-books';
import { entryStatus, PriceBookEntryDraft } from '../../../../../shared/domain/pricing';
import {
  marginAfterSupport,
  marginOnCost,
  SupportDraft,
  supportFromDraft,
  validateSupportDraft,
} from '../../../../../shared/domain/support';
import { ProductPickerComponent } from './product-picker.component';

type Mode = 'create' | 'edit' | 'view';
type HeaderField = 'id' | 'name' | 'description' | 'effectiveDate' | 'expirationDate';
type EntryField = 'effectiveStart' | 'effectiveEnd' | 'memo';

const NO_ERRORS: PriceBookErrors = { entries: Object.create(null), form: [] };

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
  private readonly workspace = inject(PricingWorkspaceService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly today = todayInManila();

  readonly mode = signal<Mode>('view');
  readonly bookId = signal<string | null>(null);
  readonly book = computed(() => {
    const id = this.bookId();
    return id ? this.service.byId(id) : undefined;
  });
  readonly loaded = this.workspace.loaded;
  readonly notFound = computed(() => this.loaded() && this.mode() !== 'create' && !this.book());
  /** The book's `updatedAt` when it was opened; sent so a newer change by someone else refuses the save. */
  private openedUpdatedAt: string | undefined;
  private opened = false;
  private pendingFocus: string | null = null;
  readonly draft = signal<PriceBookDraft>(emptyDraft(this.today));
  private initialDraft = '';
  readonly attempted = signal(false);
  readonly pickerOpen = signal(false);
  readonly editingProductId = signal<string | null>(null);
  readonly editingEntry = computed(
    () => this.draft().entries.find((e) => e.productId === this.editingProductId()) ?? null,
  );
  readonly manualFields = MANUAL_PRODUCT_FIELDS;
  readonly parseAmount = parseMoney;
  readonly busy = signal(false);
  readonly notice = signal('');
  readonly error = signal('');

  readonly errors = computed(() =>
    validatePriceBook(
      this.draft(),
      this.service.books(),
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
  /** The Price ID this book has (or will get); PS books carry Support. */
  readonly supportBook = computed(() => {
    if (this.mode() !== 'create') return isSupportBook(this.bookId() ?? '');
    const draft = this.draft();
    return isSupportBook(draft.autoId ? this.nextId() : normalizePriceId(draft.id));
  });
  readonly columnCount = computed(() => (this.editable() ? 17 : 16) + (this.supportBook() ? 2 : 0));
  readonly rows = computed(() =>
    this.draft().entries.map((entry) => {
      const manualNet = parseMoney(entry.manual.netPrice);
      const manualCost = parseMoney(entry.manual.cost);
      const basis =
        manualNet !== null && manualCost !== null ? { price: manualNet, cost: manualCost } : null;
      const supportDraft = entry.support ?? '';
      const support = validateSupportDraft(supportDraft)
        ? undefined
        : supportFromDraft(supportDraft);
      const margin = basis ? marginOnCost(basis.price, basis.cost) : null;
      const afterSupport = basis ? marginAfterSupport(basis.price, basis.cost, support) : null;
      return {
        entry,
        margin,
        afterSupport,
        support,
        supportDraft,
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
  readonly productIds = computed(() =>
    this.draft()
      .entries.filter((e) => e.productId !== this.editingProductId())
      .map((e) => e.productId),
  );
  readonly nextId = computed(() => nextPriceBookId(this.service.books()));

  updateAutoId(event: Event) {
    const autoId = (event.target as HTMLInputElement).checked;
    this.draft.update((d) => ({ ...d, autoId }));
  }

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      this.mode.set((this.route.snapshot.data['mode'] as Mode | undefined) ?? 'view');
      this.bookId.set(params.get('id'));
      const state = history.state as { notice?: unknown; focusProduct?: unknown } | null;
      this.notice.set(typeof state?.notice === 'string' ? state.notice : '');
      this.pendingFocus =
        this.mode() === 'edit' && typeof state?.focusProduct === 'string'
          ? state.focusProduct
          : null;
      this.opened = false;
      void this.workspace.ensureLoaded().then(() => this.open());
    });
    // A failed first load can be retried from the shell; open the book once it arrives.
    effect(() => {
      if (this.loaded()) untracked(() => this.open());
    });
  }

  /** Opens the requested book once price books are loaded (once per route). */
  private open() {
    if (this.opened || !this.loaded()) return;
    this.opened = true;
    this.load();
    if (this.pendingFocus) this.focusRow(this.pendingFocus);
    this.pendingFocus = null;
  }

  /**
   * Clicking a product opens Edit product with all of its details. While viewing, the book
   * switches to edit mode first. Clicks on the row's own inputs and buttons are left alone.
   */
  openRow(productId: string, event: Event) {
    if ((event.target as HTMLElement).closest('input, select, textarea, button, a')) return;
    if (this.mode() === 'view') {
      if (!this.bookId()) return;
      void this.router.navigate(['/price-books', this.bookId(), 'edit'], {
        state: { focusProduct: productId },
      });
      return;
    }
    this.openProductPicker(productId);
  }

  private focusRow(productId: string) {
    setTimeout(() => {
      const row = Array.from(
        this.host.nativeElement.querySelectorAll<HTMLElement>('tr[data-product]'),
      ).find((r) => r.dataset['product'] === productId);
      row?.scrollIntoView({ block: 'center' });
      if (this.draft().entries.some((e) => e.productId === productId))
        this.openProductPicker(productId);
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

  updateSupport(productId: string, event: Event) {
    const support = (event.target as HTMLInputElement).value;
    this.draft.update((d) => ({
      ...d,
      entries: d.entries.map((e) => (e.productId === productId ? { ...e, support } : e)),
    }));
  }

  openProductPicker(productId: string | null = null) {
    this.editingProductId.set(productId);
    this.pickerOpen.set(true);
  }

  saveManualProduct(value: {
    productId: string;
    manual: ManualProductDraft;
    support?: SupportDraft;
    effectiveStart: string;
    effectiveEnd: string;
    memo: string;
  }) {
    this.draft.update((draft) => {
      const existing = draft.entries.find((e) => e.productId === this.editingProductId());
      const entry: PriceBookEntryDraft = {
        ...existing,
        ...value,
        updatedPrice: value.manual.netPrice,
        promoPrice: '',
      };
      return {
        ...draft,
        entries: existing
          ? draft.entries.map((e) => (e === existing ? entry : e))
          : [...draft.entries, entry],
      };
    });
    this.pickerOpen.set(false);
    this.editingProductId.set(null);
  }

  removeProduct(productId: string) {
    this.draft.update((d) => ({
      ...d,
      entries: d.entries.filter((e) => e.productId !== productId),
    }));
  }

  async save() {
    if (this.busy()) return;
    this.attempted.set(true);
    const editing = this.mode() === 'edit';
    this.busy.set(true);
    let result;
    try {
      result = await this.service.save(
        this.draft(),
        editing ? this.bookId() : null,
        editing ? this.openedUpdatedAt : undefined,
      );
    } finally {
      this.busy.set(false);
    }
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

  async duplicate() {
    const id = this.bookId();
    if (!id || this.busy()) return;
    this.busy.set(true);
    let result;
    try {
      result = await this.service.duplicate(id);
    } finally {
      this.busy.set(false);
    }
    if (!result.ok) return this.error.set(result.error);
    void this.router.navigate(['/price-books', result.value.id], {
      state: { notice: `${result.value.id} created as an inactive copy of ${id}.` },
    });
  }

  async toggleActive() {
    const book = this.book();
    if (!book || this.busy()) return;
    this.busy.set(true);
    let result;
    try {
      result = await this.service.setActive(book.id, !book.active);
    } finally {
      this.busy.set(false);
    }
    if (!result.ok) return this.error.set(result.error);
    this.load();
    this.error.set('');
    this.notice.set(`${book.id} ${result.value.active ? 'activated' : 'deactivated'}.`);
  }

  entryLabel(field: string, entry: PriceBookEntryDraft) {
    return `${field} for ${entry.productId}`;
  }

  private load() {
    const book = this.book();
    this.draft.set(book && this.mode() !== 'create' ? draftFromBook(book) : emptyDraft(this.today));
    this.openedUpdatedAt = book && this.mode() !== 'create' ? book.updatedAt : undefined;
    this.initialDraft = JSON.stringify(this.draft());
    this.attempted.set(false);
    this.error.set('');
    this.pickerOpen.set(false);
    this.editingProductId.set(null);
  }

  private isDirty() {
    return JSON.stringify(this.draft()) !== this.initialDraft;
  }
}
