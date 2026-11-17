import { Injectable, signal } from '@angular/core';
import { Product, searchProducts } from '../domain/pricing';
import { PRODUCTS } from '../mock-data/products';

/**
 * In-memory product catalog: the demo products plus any imported from a sales export this session.
 * Master list prices here are never changed by price books.
 */
@Injectable({ providedIn: 'root' })
export class ProductCatalogService {
  private readonly store = signal<readonly Product[]>(PRODUCTS);
  readonly products = this.store.asReadonly();

  byId(id: string): Product | undefined {
    return this.store().find((p) => p.id === id);
  }

  search(query: string): Product[] {
    return searchProducts(this.store(), query);
  }

  /** Replaces the catalog, e.g. with demo products plus newly imported ones. */
  replaceAll(products: readonly Product[]): void {
    this.store.set(products);
  }
}
