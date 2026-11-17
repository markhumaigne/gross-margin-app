import { computed, Injectable, signal } from '@angular/core';
import { fail, Result } from '../domain/result';
import { hasPermission, Role } from '../domain/roles';
import {
  accountingHead,
  addUser,
  changeRole,
  NewUserDraft,
  setUserActive,
  transferAccountingHead,
  UserAccount,
} from '../domain/user-accounts';
import { SEED_USERS } from '../mock-data/users';

const NO_PERMISSION = 'You do not have permission to manage user accounts.';

/** In-memory mock account store. Replace with an API-backed service when a backend exists. */
@Injectable({ providedIn: 'root' })
export class UserAccountsService {
  private readonly store = signal<readonly UserAccount[]>(SEED_USERS);
  readonly users = this.store.asReadonly();
  readonly accountingHead = computed(() => accountingHead(this.store()));

  add(actor: UserAccount, draft: NewUserDraft): Result<UserAccount[]> {
    return this.apply(actor, () => addUser(this.store(), draft));
  }

  changeRole(actor: UserAccount, targetId: string, role: Role): Result<UserAccount[]> {
    return this.apply(actor, () => changeRole(this.store(), actor.id, targetId, role));
  }

  transferAccountingHead(
    actor: UserAccount,
    newHolderId: string,
    previousHolderRole: Exclude<Role, 'accounting-head'>,
  ): Result<UserAccount[]> {
    return this.apply(actor, () =>
      transferAccountingHead(this.store(), newHolderId, previousHolderRole),
    );
  }

  setActive(actor: UserAccount, targetId: string, active: boolean): Result<UserAccount[]> {
    return this.apply(actor, () => setUserActive(this.store(), actor.id, targetId, active));
  }

  private apply(actor: UserAccount, change: () => Result<UserAccount[]>): Result<UserAccount[]> {
    if (!hasPermission(actor.role, 'users')) return fail(NO_PERMISSION);
    const result = change();
    if (result.ok) this.store.set(result.value);
    return result;
  }
}
