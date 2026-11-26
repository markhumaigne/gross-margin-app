import { computed, inject, Injectable, signal } from '@angular/core';
import { Result } from '../../../../shared/domain/result';
import { hasPermission, Permission } from '../../../../shared/domain/roles';
import { authenticate, UserAccount } from '../../../../shared/domain/user-accounts';
import { KeepAliveRouteReuseStrategy } from './keep-alive-route-reuse.strategy';
import { UserAccountsService } from './user-accounts.service';

/**
 * Mock sign-in held in memory only. A page refresh signs the user out by design: this is a
 * frontend prototype, not production authentication.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly accounts = inject(UserAccountsService);
  private readonly keptPages = inject(KeepAliveRouteReuseStrategy);
  private readonly userId = signal<string | null>(null);

  readonly currentUser = computed<UserAccount | null>(() => {
    const id = this.userId();
    return this.accounts.users().find((u) => u.id === id && u.active) ?? null;
  });
  readonly role = computed(() => this.currentUser()?.role ?? null);

  login(username: string, password: string): Result<UserAccount> {
    const result = authenticate(this.accounts.users(), username, password);
    if (result.ok) {
      this.keptPages.clear();
      this.userId.set(result.value.id);
    }
    return result;
  }

  logout(): void {
    this.userId.set(null);
  }

  /** Discards pages kept alive for the signed-out session (call after leaving the shell). */
  discardKeptPages(): void {
    this.keptPages.clear();
  }

  can(permission: Permission): boolean {
    return hasPermission(this.role(), permission);
  }
}
