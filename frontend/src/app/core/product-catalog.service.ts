import { inject, Injectable } from '@angular/core';
import { Product, searchProducts } from '../../../../shared/domain/pricing';
import { PricingWorkspaceService } from './pricing-workspace.service';

/**
 * Shared browser catalog: the demo products plus any imported from a sales export.
 * Master list prices here are never changed by price books.
 */
@Injectable({ providedIn: 'root' })
export class ProductCatalogService {
  readonly products = inject(PricingWorkspaceService).products;

  byId(id: string): Product | undefined {
    return this.products().find((p) => p.id === id);
  }

  search(query: string): Product[] {
    return searchProducts(this.products(), query);
  }
}
