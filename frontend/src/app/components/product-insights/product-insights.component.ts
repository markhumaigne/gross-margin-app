import { Component, computed, inject, Input, signal } from '@angular/core';
import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { PriceBookService } from '../../core/price-book.service';
import { PRICE_MATCH_LABELS } from '../../domain/price-match';
import { readSpreadsheet } from '../../domain/read-spreadsheet';
import {
  buildSalesReport,
  ColumnMapping,
  CostBasis,
  mappingFromSelection,
  ProductSalesLine,
  resolveCostBasis,
} from '../../domain/sales-report';
import { ReportUpload } from '../../models';

interface Source {
  rows: unknown[][];
  headerRow: number;
  mapping: ColumnMapping;
  costBasis: CostBasis;
}

/**
 * Sections 05/06 of the calculator: gross margin by product and the Price ID / price book
 * comparison, computed in the browser from the same uploaded file and the live price books.
 */
@Component({
  selector: 'app-product-insights',
  standalone: true,
  imports: [CurrencyPipe, DecimalPipe],
  templateUrl: './product-insights.component.html',
})
export class ProductInsightsComponent {
  private readonly priceBooks = inject(PriceBookService);
  readonly pricingError = this.priceBooks.loadError;
  readonly issueLimit = 200;
  readonly matchLabels = PRICE_MATCH_LABELS;
  readonly loading = signal(false);
  readonly error = signal('');
  private readonly source = signal<Source | null>(null);
  private generation = 0;

  /** Recomputes whenever the source file or any price book changes. */
  readonly report = computed(() => {
    const source = this.source();
    if (!source) return null;
    return buildSalesReport(
      source.rows,
      { headerRow: source.headerRow, mapping: source.mapping, costBasis: source.costBasis },
      this.priceBooks.books(),
    );
  });

  @Input({ required: true }) set upload(value: ReportUpload) {
    void this.load(value);
  }

  priceIdsLabel(line: ProductSalesLine): string {
    const ids = line.priceIds.join(', ');
    if (!ids) return 'Regular price';
    return line.regularPriceRows ? ids + ', Regular price' : ids;
  }

  private async load(upload: ReportUpload) {
    const generation = ++this.generation;
    this.loading.set(true);
    this.error.set('');
    this.source.set(null);
    try {
      const rows = await readSpreadsheet(upload.file, upload.selection.sheet);
      if (generation !== this.generation) return;
      const headerRow = upload.selection.headerRow - 1;
      const mapping = mappingFromSelection(rows[headerRow] ?? [], upload.selection.mapping);
      if (mapping.productId === null || mapping.quantity === null || mapping.netSales === null) {
        this.error.set('Map Product ID, Quantity and Net Total to see the product sections.');
        return;
      }
      this.source.set({
        rows,
        headerRow,
        mapping,
        costBasis: resolveCostBasis(upload.selection.costBasis, upload.preview.suggestedCostBasis),
      });
    } catch {
      if (generation === this.generation)
        this.error.set('The uploaded file could not be read for the product sections.');
    } finally {
      if (generation === this.generation) this.loading.set(false);
    }
  }
}
