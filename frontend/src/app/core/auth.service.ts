import { computed, inject, Injectable, signal } from '@angular/core';
import { Result } from '../domain/result';
import { hasPermission, Permission } from '../domain/roles';
import { authenticate, UserAccount } from '../domain/user-accounts';
import { UserAccountsService } from './user-accounts.service';

/**
 * Mock sign-in held in memory only. A page refresh signs the user out by design: this is a
 * frontend prototype, not production authentication.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly accounts = inject(UserAccountsService);
  private readonly userId = signal<string | null>(null);

  readonly currentUser = computed<UserAccount | null>(() => {
    const id = this.userId();
    return this.accounts.users().find((u) => u.id === id && u.active) ?? null;
  });
  readonly role = computed(() => this.currentUser()?.role ?? null);

  login(username: string, password: string): Result<UserAccount> {
    const result = authenticate(this.accounts.users(), username, password);
    if (result.ok) this.userId.set(result.value.id);
    return result;
  }

  logout(): void {
    this.userId.set(null);
  }

  can(permission: Permission): boolean {
    return hasPermission(this.role(), permission);
  }
}
