import { Component, effect, inject, signal, untracked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { RouterLink } from '@angular/router';
import { ExcelUploadComponent } from '../excel-upload/excel-upload.component';
import { ConfigurationComponent } from '../configuration/configuration.component';
import { CalculationResultsComponent } from '../calculation-results/calculation-results.component';
import { ProductInsightsComponent } from '../product-insights/product-insights.component';
import { downloadSampleExport } from '../../core/sample-download';
import { PriceBookService } from '../../core/price-book.service';
import { PricingWorkspaceService } from '../../core/pricing-workspace.service';
import { supportList } from '../../../../../shared/domain/price-books';
import { CalculationResponse, Configuration, ReportUpload } from '../../models';
import { ExcelApiService, readableError, saveDownload } from '../../services/excel-api.service';
@Component({
  selector: 'app-calculator',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatProgressBarModule,
    RouterLink,
    ExcelUploadComponent,
    ConfigurationComponent,
    CalculationResultsComponent,
    ProductInsightsComponent,
  ],
  templateUrl: './dashboard.component.html',
})
export class DashboardComponent {
  readonly api = inject(ExcelApiService);
  private readonly priceBooks = inject(PriceBookService);
  private readonly pricing = inject(PricingWorkspaceService);
  readonly configSeed = signal<Configuration | undefined>(undefined);
  readonly response = signal<CalculationResponse | undefined>(undefined);
  /** The upload behind the current results; drives the product sections (05/06). */
  readonly analysedUpload = signal<ReportUpload | undefined>(undefined);
  readonly busy = signal(false);
  readonly configBusy = signal(false);
  readonly downloading = signal(false);
  /** True once the current results were downloaded; marks the last step of the rail done. */
  readonly downloaded = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly loadingDefaults = signal(true);
  sales?: ReportUpload;
  configuration?: Configuration;
  configValid = false;
  revision = 0;
  /** True while `error` holds the price-book load failure, so a later successful load clears it. */
  private showingLoadFailure = false;
  constructor() {
    effect(() => {
      if (!this.pricing.loaded()) return;
      untracked(() => {
        if (!this.showingLoadFailure) return;
        this.showingLoadFailure = false;
        this.error.set('');
      });
    });
    void this.loadDefaults();
  }
  async loadDefaults() {
    this.loadingDefaults.set(true);
    this.error.set('');
    try {
      const c = await this.api.defaults();
      this.invalidate();
      this.configSeed.set(c);
      this.notice.set('Default settings loaded.');
    } catch (e) {
      this.error.set(await readableError(e));
    } finally {
      this.loadingDefaults.set(false);
    }
  }
  setReport(report: ReportUpload | undefined) {
    this.sales = report;
    this.invalidate();
  }
  setConfig(event: { configuration: Configuration; valid: boolean }) {
    this.configuration = event.configuration;
    this.configValid = event.valid;
    this.invalidate();
  }
  invalidate() {
    this.revision++;
    this.downloaded.set(false);
    this.analysedUpload.set(undefined);
    if (this.response()) {
      this.response.set(undefined);
      this.notice.set('Inputs changed. Calculate again to update the results.');
    }
  }
  /** The first step still to do, highlighted in the progress rail. */
  get currentStep() {
    if (!this.sales?.valid) return 1;
    if (!this.configValid) return 2;
    if (!this.response()) return 3;
    return 4;
  }
  get ready() {
    return (
      !!this.sales?.valid &&
      this.configValid &&
      !!this.configuration &&
      !this.busy() &&
      !this.loadingDefaults() &&
      !this.configBusy()
    );
  }
  async calculate() {
    if (!this.ready) return;
    const revision = this.revision;
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    this.response.set(undefined);
    this.downloaded.set(false);
    try {
      const loaded = await this.pricing.ensureLoaded();
      if (!loaded.ok) {
        this.showingLoadFailure = true;
        this.error.set(loaded.error);
        return;
      }
      // PS Support from the saved price books becomes Supplier Support.
      const response = await this.api.calculate(
        this.sales!,
        this.configuration!,
        supportList(this.priceBooks.books()),
      );
      if (revision === this.revision) {
        this.response.set(response);
        this.analysedUpload.set(this.sales);
        this.notice.set('Calculation complete. Your Excel report is ready.');
        setTimeout(
          () =>
            document
              .getElementById('results')
              ?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
          100,
        );
      } else
        this.notice.set(
          'Inputs changed during processing. Calculate again with the current settings.',
        );
    } catch (e) {
      this.error.set(await readableError(e));
    } finally {
      this.busy.set(false);
    }
  }
  async importConfig(file: File) {
    this.configBusy.set(true);
    this.error.set('');
    try {
      const c = await this.api.import(file);
      this.invalidate();
      this.configSeed.set(c);
      this.notice.set('Configuration imported. Review the settings before calculating.');
    } catch (e) {
      this.error.set(await readableError(e));
    } finally {
      this.configBusy.set(false);
    }
  }
  async exportConfig() {
    if (!this.configuration) return;
    this.configBusy.set(true);
    this.error.set('');
    try {
      saveDownload(await this.api.exportConfig(this.configuration), 'Bank_Rate_Configuration.xlsx');
    } catch (e) {
      this.error.set(await readableError(e));
    } finally {
      this.configBusy.set(false);
    }
  }
  downloadSample() {
    void downloadSampleExport();
  }
  async download() {
    const response = this.response();
    if (!response) return;
    this.downloading.set(true);
    this.error.set('');
    try {
      saveDownload(await this.api.exportReport(response), 'Sales_Bank_Rate_Deductions.xlsx');
      this.downloaded.set(true);
    } catch (e) {
      this.error.set(await readableError(e));
    } finally {
      this.downloading.set(false);
    }
  }
}
