import {
  AfterViewInit,
  Component,
  computed,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  OnInit,
  Output,
  signal,
  ViewChild,
} from '@angular/core';
import { A11yModule } from '@angular/cdk/a11y';
import { MatButtonModule } from '@angular/material/button';
import { PriceBookEntryDraft } from '../../../../../shared/domain/pricing';
import { SupportDraft, validateSupportDraft } from '../../../../../shared/domain/support';
import {
  emptyManualProduct,
  MANUAL_PRODUCT_FIELDS,
  ManualProductDraft,
  ManualProductField,
  validateManualProduct,
} from '../../../../../shared/domain/manual-products';

/** Adds a product to a price book, or edits one, by entering its details. */
@Component({
  selector: 'app-product-picker',
  standalone: true,
  imports: [MatButtonModule, A11yModule],
  templateUrl: './product-picker.component.html',
})
export class ProductPickerComponent implements OnInit, AfterViewInit {
  @Input() excludedIds: readonly string[] = [];
  @Input() initialEntry: PriceBookEntryDraft | null = null;
  /** PS (external promotion) books show the Support field. */
  @Input() supportEnabled = false;
  /** Validity for a new product: the price book's dates. */
  @Input() defaultDates: { effectiveStart: string; effectiveEnd: string } = {
    effectiveStart: '',
    effectiveEnd: '',
  };
  @Output() manualAdd = new EventEmitter<{
    productId: string;
    manual: ManualProductDraft;
    support?: SupportDraft;
    effectiveStart: string;
    effectiveEnd: string;
    memo: string;
  }>();
  @Output() closed = new EventEmitter<void>();
  @ViewChild('productIdInput') private productIdInput?: ElementRef<HTMLInputElement>;
  readonly fields = MANUAL_PRODUCT_FIELDS;
  readonly productId = signal('');
  readonly manual = signal(emptyManualProduct());
  readonly attempted = signal(false);
  readonly errors = computed(() =>
    validateManualProduct(this.productId(), this.manual(), this.excludedIds),
  );
  readonly shownErrors = computed(() => (this.attempted() ? this.errors() : {}));
  readonly support = signal<SupportDraft>('');
  readonly supportError = computed(() => validateSupportDraft(this.support()));
  readonly shownSupportError = computed(() => (this.attempted() ? this.supportError() : null));

  /** Row validity and memo, edited together with the product details. */
  readonly rowInfo = signal({ effectiveStart: '', effectiveEnd: '', memo: '' });

  updateRowInfo(field: 'effectiveStart' | 'effectiveEnd' | 'memo', event: Event) {
    const value = (event.target as HTMLInputElement).value;
    this.rowInfo.update((info) => ({ ...info, [field]: value }));
  }

  ngOnInit() {
    const entry = this.initialEntry;
    this.rowInfo.set(
      entry
        ? {
            effectiveStart: entry.effectiveStart,
            effectiveEnd: entry.effectiveEnd,
            memo: entry.memo,
          }
        : { ...this.defaultDates, memo: '' },
    );
    if (entry) {
      this.productId.set(entry.productId);
      this.manual.set({ ...entry.manual });
      if (entry.support !== undefined) this.support.set(entry.support);
    }
  }

  ngAfterViewInit() {
    this.productIdInput?.nativeElement.focus();
  }

  updateManual(field: ManualProductField, event: Event) {
    const value = (event.target as HTMLInputElement).value;
    this.manual.update((draft) => ({ ...draft, [field]: value }));
  }

  updateSupport(event: Event) {
    this.support.set((event.target as HTMLInputElement).value);
  }

  confirmManual() {
    this.attempted.set(true);
    if (Object.keys(this.errors()).length) return;
    if (this.supportEnabled && this.supportError()) return;
    this.manualAdd.emit({
      productId: this.productId().trim(),
      manual: { ...this.manual() },
      ...(this.supportEnabled ? { support: this.support() } : {}),
      ...this.rowInfo(),
    });
  }

  @HostListener('document:keydown.escape')
  close() {
    this.closed.emit();
  }
}
