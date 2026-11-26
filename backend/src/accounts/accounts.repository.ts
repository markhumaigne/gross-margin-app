import { Injectable } from '@nestjs/common';
import type { UserAccount } from '../../../shared/domain/user-accounts';
import { Db, PrismaService } from '../database/prisma.service';
import { userFromRow } from '../database/mappers';

@Injectable()
export class AccountsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string, db: Db = this.prisma): Promise<UserAccount | null> {
    const row = await db.user.findUnique({ where: { id } });
    return row ? userFromRow(row) : null;
  }

  /** Username is trimmed and matched without regard to case. */
  async findForSignIn(
    username: string,
  ): Promise<{ account: UserAccount; passwordHash: string } | null> {
    const row = await this.prisma.user.findFirst({
      where: { username: { equals: username.trim(), mode: 'insensitive' } },
    });
    return row ? { account: userFromRow(row), passwordHash: row.passwordHash } : null;
  }
}
