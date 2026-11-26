import { Injectable } from '@nestjs/common';
import type { UserAccount } from '../../../shared/domain/user-accounts';
import { Db, PrismaService } from '../database/prisma.service';
import { userFromRow } from '../database/mappers';

/** Escapes the characters ILIKE treats as pattern syntax, so a value matches only itself. */
export const escapeLike = (value: string): string => value.replace(/[\\%_]/g, '\\$&');

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
    const wanted = username.trim().toLowerCase();
    // Insensitive equality is an ILIKE, so the pattern is escaped; the check below is exact.
    const row = await this.prisma.user.findFirst({
      where: { username: { equals: escapeLike(wanted), mode: 'insensitive' } },
    });
    return row && row.username.toLowerCase() === wanted
      ? { account: userFromRow(row), passwordHash: row.passwordHash }
      : null;
  }
}
