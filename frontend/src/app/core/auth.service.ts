import { computed, inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type { LoginRequest, LoginResponse } from '../../../../shared/api';
import { Result } from '../../../../shared/domain/result';
import { hasPermission, Permission } from '../../../../shared/domain/roles';
import { UserAccount } from '../../../../shared/domain/user-accounts';
import { apiResult } from './api-result';
import { KeepAliveRouteReuseStrategy } from './keep-alive-route-reuse.strategy';

/**
 * Signs in through the API. The token is held in memory only: a page refresh signs the user
 * out by design, and nothing is written to browser storage.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly keptPages = inject(KeepAliveRouteReuseStrategy);
  private token: string | null = null;
  private readonly user = signal<UserAccount | null>(null);

  readonly currentUser = this.user.asReadonly();
  readonly role = computed(() => this.user()?.role ?? null);

  accessToken(): string | null {
    return this.token;
  }

  async login(username: string, password: string): Promise<Result<UserAccount>> {
    const body: LoginRequest = { username, password };
    const result = await apiResult(
      firstValueFrom(this.http.post<LoginResponse>('/api/auth/login', body)),
    );
    if (!result.ok) return result;
    this.keptPages.clear();
    this.token = result.value.token;
    this.user.set(result.value.user);
    return { ok: true, value: result.value.user };
  }

  logout(): void {
    this.token = null;
    this.user.set(null);
  }

  /** Discards pages kept alive for the signed-out session (call after leaving the shell). */
  discardKeptPages(): void {
    this.keptPages.clear();
  }

  can(permission: Permission): boolean {
    return hasPermission(this.role(), permission);
  }
}
