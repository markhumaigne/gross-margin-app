import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { PriceBook } from '../domain/price-books';
import { Product } from '../domain/pricing';
import {
  PRICING_STORAGE_KEY,
  PricingSnapshot,
  readPricingStorage,
  writePricingStorage,
} from '../domain/pricing-storage';
import { fail, ok, Result } from '../domain/result';
import { SEED_PRICE_BOOKS } from '../mock-data/price-books';
import { PRODUCTS } from '../mock-data/products';

const INITIAL: PricingSnapshot = { version: 1, books: SEED_PRICE_BOOKS, products: PRODUCTS };

/** Shared demo pricing data for all accounts and tabs on this browser origin. */
@Injectable({ providedIn: 'root' })
export class PricingWorkspaceService {
  private readonly state = signal<PricingSnapshot>(INITIAL);
  readonly books = computed(() => this.state().books);
  readonly products = computed(() => this.state().products);
  readonly error = signal('');

  constructor() {
    this.reload();
    const update = (event: StorageEvent) => {
      if (event.key === PRICING_STORAGE_KEY || event.key === null) this.reload();
    };
    window.addEventListener('storage', update);
    inject(DestroyRef).onDestroy(() => window.removeEventListener('storage', update));
  }

  /** Read before mutations too: a storage event from another tab may still be queued. */
  reload(): Result<void> {
    const result = readPricingStorage(() => window.localStorage);
    if (!result.ok) {
      this.error.set(result.error);
      return fail(result.error);
    }
    this.state.set(result.value ?? INITIAL);
    this.error.set('');
    return ok(undefined);
  }

  commit(
    books: readonly PriceBook[],
    products: readonly Product[] = this.products(),
  ): Result<void> {
    const next: PricingSnapshot = { version: 1, books, products };
    const result = writePricingStorage(() => window.localStorage, next);
    if (!result.ok) {
      this.error.set(result.error);
      return result;
    }
    // Publish only after durable storage accepts the entire snapshot.
    this.state.set(next);
    this.error.set('');
    return ok(undefined);
  }
}
