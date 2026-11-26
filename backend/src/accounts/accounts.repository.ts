import { Injectable } from '@nestjs/common';
import type { UserAccount } from '../../../shared/domain/user-accounts';
import { Db, PrismaService } from '../database/prisma.service';
import { userFromRow } from '../database/mappers';
import { planUserWrites } from './user-writes';

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

  /** Ordered by the number in `u-N`, so the list stays stable as accounts are added. */
  async list(db: Db = this.prisma): Promise<UserAccount[]> {
    const rows = await db.user.findMany();
    const number = (id: string) => Number(id.replace(/^u-/, '')) || 0;
    return rows
      .sort((a, b) => number(a.id) - number(b.id) || a.id.localeCompare(b.id))
      .map(userFromRow);
  }

  /** Writes demotions, then updates, then inserts (the one-Accounting-Head index needs that order). */
  async apply(
    db: Db,
    before: readonly UserAccount[],
    after: readonly UserAccount[],
    newPasswordHash?: string,
  ): Promise<void> {
    const { demotions, updates, inserts } = planUserWrites(before, after);
    for (const u of [...demotions, ...updates])
      await db.user.update({
        where: { id: u.id },
        data: {
          username: u.username,
          displayName: u.displayName,
          role: u.role,
          active: u.active,
        },
      });
    for (const u of inserts) {
      if (!newPasswordHash) throw new Error('A new account needs a password hash.');
      await db.user.create({ data: { ...u, passwordHash: newPasswordHash } });
    }
  }
}
