import { BadRequestException, Injectable } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import type { Result } from '../../../shared/domain/result';
import type { AssignableRole, Role } from '../../../shared/domain/roles';
import {
  addUser,
  changeRole,
  NewUserDraft,
  setUserActive,
  transferAccountingHead,
  UserAccount,
} from '../../../shared/domain/user-accounts';
import { BCRYPT_COST } from '../database/seed';
import { lock, TX_OPTIONS, USERS_LOCK } from '../database/locks';
import { PrismaService } from '../database/prisma.service';
import { AccountsRepository } from './accounts.repository';

@Injectable()
export class AccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounts: AccountsRepository,
  ) {}

  list(): Promise<UserAccount[]> {
    return this.accounts.list();
  }

  async add(_actor: UserAccount, draft: NewUserDraft): Promise<UserAccount[]> {
    // Hashed before the transaction opens: cost 12 is slow and must not hold the lock.
    const passwordHash = await bcrypt.hash(draft.password, BCRYPT_COST);
    return this.mutate((users) => addUser(users, draft), passwordHash);
  }

  changeRole(actor: UserAccount, targetId: string, role: Role): Promise<UserAccount[]> {
    return this.mutate((users) => changeRole(users, actor.id, targetId, role));
  }

  setActive(actor: UserAccount, targetId: string, active: boolean): Promise<UserAccount[]> {
    return this.mutate((users) => setUserActive(users, actor.id, targetId, active));
  }

  transferAccountingHead(
    actor: UserAccount,
    newHolderId: string,
    previousHolderRole: AssignableRole,
  ): Promise<UserAccount[]> {
    return this.mutate((users) =>
      transferAccountingHead(users, actor.id, newHolderId, previousHolderRole),
    );
  }

  /** Applies a domain change to the stored accounts under the users lock; a refusal changes nothing. */
  private mutate(
    change: (users: readonly UserAccount[]) => Result<UserAccount[]>,
    newPasswordHash?: string,
  ): Promise<UserAccount[]> {
    return this.prisma.$transaction(async (tx) => {
      await lock(tx, USERS_LOCK);
      const before = await this.accounts.list(tx);
      const result = change(before);
      if (!result.ok) throw new BadRequestException(result.error);
      await this.accounts.apply(tx, before, result.value, newPasswordHash);
      return this.accounts.list(tx);
    }, TX_OPTIONS);
  }
}
