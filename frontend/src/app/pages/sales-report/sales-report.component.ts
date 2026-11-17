import { Component, computed, inject, signal } from '@angular/core';
import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { ProductCatalogService } from '../../core/product-catalog.service';
import { isBlank } from '../../domain/money';
import { readSpreadsheet } from '../../domain/read-spreadsheet';
import {
  buildSalesReport,
  ColumnMapping,
  CostBasis,
  CostSource,
  detectMapping,
  FIELD_LABELS,
  findHeaderRow,
  missingRequiredFields,
  REQUIRED_FIELDS,
  SalesField,
  validateUploadFile,
} from '../../domain/sales-report';
import { SAMPLE_SALES_ROWS, sampleSalesCsv } from '../../mock-data/sample-sales';

const EMPTY_MAPPING: ColumnMapping = {
  productId: null,
  productName: null,
  quantity: null,
  netSales: null,
  cost: null,
};

const COST_SOURCE_LABELS: Record<CostSource, string> = {
  report: 'Report cost',
  estimate: 'Estimate (current mock cost)',
  mixed: 'Report + estimate',
  missing: 'Missing cost',
};

const nonBlankRow = (row: unknown[] | undefined) => !!row && row.some((c) => !isBlank(c));

@Component({
  selector: 'app-sales-report',
  standalone: true,
  imports: [CurrencyPipe, DecimalPipe, MatButtonModule, MatProgressBarModule],
  templateUrl: './sales-report.component.html',
})
export class SalesReportComponent {
  private readonly catalog = inject(ProductCatalogService);
  readonly fields: SalesField[] = ['productId', 'productName', 'quantity', 'netSales', 'cost'];
  readonly fieldLabels = FIELD_LABELS;
  readonly requiredFields = REQUIRED_FIELDS;
  readonly costSourceLabels = COST_SOURCE_LABELS;

  readonly fileName = signal('');
  readonly rows = signal<unknown[][] | null>(null);
  readonly headerRow = signal(-1);
  readonly mapping = signal<ColumnMapping>(EMPTY_MAPPING);
  readonly costBasis = signal<CostBasis>('unit');
  readonly useEstimatedCost = signal(false);
  readonly uploadError = signal('');
  readonly loading = signal(false);

  readonly headers = computed(() => {
    const rows = this.rows();
    const index = this.headerRow();
    if (!rows || index < 0) return [];
    const header = rows[index] ?? [];
    const width = Math.max(header.length, ...rows.map((r) => r?.length ?? 0));
    return Array.from({ length: width }, (_, i) => ({
      index: i,
      label: String(header[i] ?? '').trim() || `Column ${i + 1}`,
    }));
  });
  readonly dataRows = computed(() =>
    (this.rows() ?? []).slice(this.headerRow() + 1).filter(nonBlankRow),
  );
  readonly previewRows = computed(() => this.dataRows().slice(0, 10));
  readonly missingFields = computed(() => missingRequiredFields(this.mapping()));
  readonly report = computed(() => {
    const rows = this.rows();
    if (!rows || this.headerRow() < 0 || this.missingFields().length) return null;
    return buildSalesReport(
      rows,
      {
        headerRow: this.headerRow(),
        mapping: this.mapping(),
        costBasis: this.costBasis(),
        useEstimatedCost: this.useEstimatedCost(),
      },
      this.catalog.products(),
    );
  });

  async pick(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) await this.readFile(file);
  }

  async drop(event: DragEvent) {
    event.preventDefault();
    const file = event.dataTransfer?.files[0];
    if (file) await this.readFile(file);
  }

  loadDemo() {
    this.loadRows(
      SAMPLE_SALES_ROWS.map((row) => [...row]),
      'Demo sales report (mock data)',
    );
  }

  downloadSample() {
    const url = URL.createObjectURL(new Blob([sampleSalesCsv()], { type: 'text/csv' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'sample-sales-report.csv';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  setMapping(field: SalesField, event: Event) {
    const value = (event.target as HTMLSelectElement).value;
    this.mapping.update((m) => ({ ...m, [field]: value === '' ? null : Number(value) }));
  }

  setCostBasis(event: Event) {
    this.costBasis.set((event.target as HTMLSelectElement).value as CostBasis);
  }

  setUseEstimatedCost(event: Event) {
    this.useEstimatedCost.set((event.target as HTMLInputElement).checked);
  }

  cellText(value: unknown): string {
    return value === null || value === undefined ? '' : String(value);
  }

  private async readFile(file: File) {
    const problem = validateUploadFile(file.name, file.size);
    if (problem) return this.fail(problem);
    this.loading.set(true);
    try {
      this.loadRows(await readSpreadsheet(file), file.name);
    } catch {
      this.fail('The file could not be read.');
    } finally {
      this.loading.set(false);
    }
  }

  private loadRows(rows: unknown[][], name: string) {
    const header = findHeaderRow(rows);
    if (header < 0 || !rows.slice(header + 1).some(nonBlankRow))
      return this.fail('No data rows were found.');
    const detected = detectMapping(rows[header]);
    this.uploadError.set('');
    this.fileName.set(name);
    this.rows.set(rows);
    this.headerRow.set(header);
    this.mapping.set(detected.mapping);
    this.costBasis.set(detected.costBasis);
  }

  private fail(message: string) {
    this.uploadError.set(message);
    this.rows.set(null);
    this.fileName.set('');
    this.headerRow.set(-1);
    this.mapping.set(EMPTY_MAPPING);
  }
}
