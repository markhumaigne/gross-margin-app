import { HttpClient } from '@angular/common/http';
import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom, Observable } from 'rxjs';
import type {
  ChangeRoleRequest,
  SetActiveRequest,
  TransferAccountingHeadRequest,
} from '../../../../shared/api';
import { Result } from '../../../../shared/domain/result';
import { AssignableRole, Role } from '../../../../shared/domain/roles';
import { accountingHead, NewUserDraft, UserAccount } from '../../../../shared/domain/user-accounts';
import { apiResult } from './api-result';
import { AuthService } from './auth.service';

/** User accounts as stored by the API; the list is empty whenever nobody is signed in. */
@Injectable({ providedIn: 'root' })
export class UserAccountsService {
  private readonly http = inject(HttpClient);
  private readonly store = signal<readonly UserAccount[]>([]);
  readonly users = this.store.asReadonly();
  readonly accountingHead = computed(() => accountingHead(this.store()));

  constructor() {
    const auth = inject(AuthService);
    effect(() => {
      if (!auth.currentUser()) this.store.set([]);
    });
  }

  load(): Promise<Result<UserAccount[]>> {
    return this.settle(this.http.get<UserAccount[]>('/api/users'));
  }

  add(draft: NewUserDraft): Promise<Result<UserAccount[]>> {
    return this.settle(this.http.post<UserAccount[]>('/api/users', draft));
  }

  changeRole(targetId: string, role: Role): Promise<Result<UserAccount[]>> {
    const body: ChangeRoleRequest = { role };
    return this.settle(
      this.http.patch<UserAccount[]>(`/api/users/${encodeURIComponent(targetId)}/role`, body),
    );
  }

  transferAccountingHead(
    newHolderId: string,
    previousHolderRole: AssignableRole,
  ): Promise<Result<UserAccount[]>> {
    const body: TransferAccountingHeadRequest = { newHolderId, previousHolderRole };
    return this.settle(this.http.post<UserAccount[]>('/api/users/accounting-head', body));
  }

  setActive(targetId: string, active: boolean): Promise<Result<UserAccount[]>> {
    const body: SetActiveRequest = { active };
    return this.settle(
      this.http.patch<UserAccount[]>(`/api/users/${encodeURIComponent(targetId)}/active`, body),
    );
  }

  private async settle(request: Observable<UserAccount[]>): Promise<Result<UserAccount[]>> {
    const result = await apiResult(firstValueFrom(request));
    if (result.ok) this.store.set(result.value);
    return result;
  }
}
