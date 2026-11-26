import { HttpClient } from '@angular/common/http';
import { computed, DestroyRef, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { PricingSnapshot } from '../../../../shared/domain/price-books';
import { fail, ok, Result } from '../../../../shared/domain/result';
import { apiResult } from './api-result';
import { AuthService } from './auth.service';

const LOAD_FAILED = 'Price books could not be loaded. Check the connection and try again.';
const EMPTY: PricingSnapshot = { books: [], products: [] };

/** Price books and the product catalog as stored by the API; empty whenever nobody is signed in. */
@Injectable({ providedIn: 'root' })
export class PricingWorkspaceService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly state = signal<PricingSnapshot>(EMPTY);
  readonly books = computed(() => this.state().books);
  readonly products = computed(() => this.state().products);
  readonly loaded = signal(false);
  readonly error = signal('');
  private inFlight: Promise<Result<void>> | null = null;
  /** Bumped on every sign-in and sign-out so a response for a previous session is dropped. */
  private session = 0;

  constructor() {
    effect(() => {
      const user = this.auth.currentUser();
      untracked(() => {
        this.session++;
        this.inFlight = null;
        this.state.set(EMPTY);
        this.loaded.set(false);
        this.error.set('');
        if (user) void this.reload();
      });
    });
    const refresh = () => {
      if (this.auth.currentUser()) void this.reload();
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVisible);
    inject(DestroyRef).onDestroy(() => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVisible);
    });
  }

  reload(): Promise<Result<void>> {
    if (!this.auth.currentUser()) return Promise.resolve(ok(undefined));
    const session = this.session;
    const request: Promise<Result<void>> = this.fetch(session).finally(() => {
      if (this.inFlight === request) this.inFlight = null;
    });
    this.inFlight = request;
    return request;
  }

  /** Resolves once price books are loaded, sharing one in-flight load and retrying after a failure. */
  ensureLoaded(): Promise<Result<void>> {
    if (this.loaded()) return Promise.resolve(ok(undefined));
    return this.inFlight ?? this.reload();
  }

  /** Publishes a snapshot returned by a write. */
  apply(snapshot: PricingSnapshot): void {
    this.state.set(snapshot);
    this.loaded.set(true);
    this.error.set('');
  }

  private async fetch(session: number): Promise<Result<void>> {
    const result = await apiResult(firstValueFrom(this.http.get<PricingSnapshot>('/api/pricing')));
    if (session !== this.session) return ok(undefined);
    if (!result.ok) {
      this.error.set(LOAD_FAILED);
      return fail(LOAD_FAILED);
    }
    this.apply(result.value);
    return ok(undefined);
  }
}
