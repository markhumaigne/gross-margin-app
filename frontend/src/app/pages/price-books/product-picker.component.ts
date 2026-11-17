import {
  AfterViewInit,
  Component,
  computed,
  ElementRef,
  EventEmitter,
  HostListener,
  inject,
  Input,
  Output,
  signal,
  ViewChild,
} from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { ProductCatalogService } from '../../core/product-catalog.service';
import { marginPercent, Product } from '../../domain/pricing';

/** Modal catalog search used to add products to a price book. */
@Component({
  selector: 'app-product-picker',
  standalone: true,
  imports: [CurrencyPipe, MatButtonModule],
  templateUrl: './product-picker.component.html',
})
export class ProductPickerComponent implements AfterViewInit {
  @Input() excludedIds: readonly string[] = [];
  @Output() add = new EventEmitter<string[]>();
  @Output() closed = new EventEmitter<void>();
  @ViewChild('searchInput') private searchInput?: ElementRef<HTMLInputElement>;
  private readonly catalog = inject(ProductCatalogService);
  readonly query = signal('');
  readonly results = computed(() => this.catalog.search(this.query()));
  readonly selected = signal<ReadonlySet<string>>(new Set());
  readonly selectable = computed(() =>
    this.results().filter((p) => !this.excludedIds.includes(p.id)),
  );
  readonly allVisibleSelected = computed(
    () => this.selectable().length > 0 && this.selectable().every((p) => this.selected().has(p.id)),
  );

  ngAfterViewInit() {
    this.searchInput?.nativeElement.focus();
  }

  @HostListener('document:keydown.escape')
  close() {
    this.closed.emit();
  }

  isExcluded(id: string) {
    return this.excludedIds.includes(id);
  }

  margin(product: Product) {
    return product.cost === null ? null : marginPercent(product.sellingPrice, product.cost);
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
