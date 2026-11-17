import { Injectable, signal } from '@angular/core';
import { Product, searchProducts } from '../domain/pricing';
import { PRODUCTS } from '../mock-data/products';

/** Read-only mock product catalog. Master list prices here are never changed by price books. */
@Injectable({ providedIn: 'root' })
export class ProductCatalogService {
  readonly products = signal<readonly Product[]>(PRODUCTS).asReadonly();

  byId(id: string): Product | undefined {
    return this.products().find((p) => p.id === id);
  }

  search(query: string): Product[] {
    return searchProducts(this.products(), query);
  }
}
