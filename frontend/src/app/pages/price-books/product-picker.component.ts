import {
  AfterViewInit,
  Component,
  computed,
  ElementRef,
  EventEmitter,
  HostListener,
  inject,
  Input,
  OnInit,
  Output,
  signal,
  ViewChild,
} from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { A11yModule } from '@angular/cdk/a11y';
import { MatButtonModule } from '@angular/material/button';
import { ProductCatalogService } from '../../core/product-catalog.service';
import { PriceBookEntryDraft, Product } from '../../domain/pricing';
import { marginOnCost } from '../../domain/support';
import {
  emptyManualProduct,
  MANUAL_PRODUCT_FIELDS,
  ManualProductDraft,
  ManualProductField,
  productIdKey,
  validateManualProduct,
} from '../../domain/manual-products';

/** Manual product entry and catalog selection for a price book. */
@Component({
  selector: 'app-product-picker',
  standalone: true,
  imports: [CurrencyPipe, MatButtonModule, A11yModule],
  templateUrl: './product-picker.component.html',
})
export class ProductPickerComponent implements OnInit, AfterViewInit {
  @Input() excludedIds: readonly string[] = [];
  @Input() initialEntry: PriceBookEntryDraft | null = null;
  @Output() add = new EventEmitter<string[]>();
  @Output() manualAdd = new EventEmitter<{ productId: string; manual: ManualProductDraft }>();
  @Output() closed = new EventEmitter<void>();
  @ViewChild('searchInput') private searchInput?: ElementRef<HTMLInputElement>;
  @ViewChild('productIdInput') private productIdInput?: ElementRef<HTMLInputElement>;
  readonly mode = signal<'manual' | 'catalog'>('manual');
  readonly fields = MANUAL_PRODUCT_FIELDS;
  readonly productId = signal('');
  readonly manual = signal(emptyManualProduct());
  readonly attempted = signal(false);
  readonly errors = computed(() =>
    validateManualProduct(this.productId(), this.manual(), this.excludedIds),
  );
  readonly shownErrors = computed(() => (this.attempted() ? this.errors() : {}));
  private readonly catalog = inject(ProductCatalogService);
  readonly query = signal('');
  readonly results = computed(() => this.catalog.search(this.query()));
  readonly selected = signal<ReadonlySet<string>>(new Set());
  readonly selectable = computed(() => this.results().filter((p) => !this.isExcluded(p.id)));
  readonly allVisibleSelected = computed(
    () => this.selectable().length > 0 && this.selectable().every((p) => this.selected().has(p.id)),
  );

  ngOnInit() {
    if (this.initialEntry?.manual) {
      this.productId.set(this.initialEntry.productId);
      this.manual.set({ ...this.initialEntry.manual });
    }
  }

  ngAfterViewInit() {
    this.productIdInput?.nativeElement.focus();
  }

  updateManual(field: ManualProductField, event: Event) {
    const value = (event.target as HTMLInputElement).value;
    this.manual.update((draft) => ({ ...draft, [field]: value }));
  }

  confirmManual() {
    this.attempted.set(true);
    if (Object.keys(this.errors()).length) return;
    this.manualAdd.emit({ productId: this.productId().trim(), manual: { ...this.manual() } });
  }

  @HostListener('document:keydown.escape')
  close() {
    this.closed.emit();
  }

  isExcluded(id: string) {
    return this.excludedIds.some((excluded) => productIdKey(excluded) === productIdKey(id));
  }

  margin(product: Product) {
    return product.cost === null ? null : marginOnCost(product.sellingPrice, product.cost);
  }

  setQuery(value: string) {
    this.query.set(value);
  }

  toggle(id: string, event: Event) {
    const checked = (event.target as HTMLInputElement).checked;
    const next = new Set(this.selected());
    if (checked) next.add(id);
    else next.delete(id);
    this.selected.set(next);
  }

  toggleAllVisible(event: Event) {
    const checked = (event.target as HTMLInputElement).checked;
    const next = new Set(this.selected());
    for (const p of this.selectable()) {
      if (checked) next.add(p.id);
      else next.delete(p.id);
    }
    this.selected.set(next);
  }

  confirm() {
    const chosen = this.catalog
      .products()
      .filter((p) => this.selected().has(p.id))
      .map((p) => p.id);
    if (chosen.length) this.add.emit(chosen);
  }
}
