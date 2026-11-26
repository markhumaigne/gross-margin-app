import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import bcrypt from 'bcryptjs';
import type { LoginResponse } from '../../../shared/api';
import { SIGN_IN_MESSAGES } from '../../../shared/domain/user-accounts';
import { AccountsRepository } from '../accounts/accounts.repository';
import { TokenService } from './token.service';

/** Compared against when the username is unknown, so that case costs the same as a wrong password. */
const DUMMY_HASH = '$2b$12$bF5rlo/.iwlBygSZ29TB6uLSDV/x78wYVAL4ygzB8VjiSXmV8CR.i';

@Injectable()
export class AuthService {
  constructor(
    private readonly accounts: AccountsRepository,
    private readonly tokens: TokenService,
  ) {}

  async signIn(username: string, password: string): Promise<LoginResponse> {
    if (
      typeof username !== 'string' ||
      typeof password !== 'string' ||
      !username.trim() ||
      !password
    )
      throw new BadRequestException(SIGN_IN_MESSAGES.missing);
    const found = await this.accounts.findForSignIn(username);
    const matches = await bcrypt.compare(password, found?.passwordHash ?? DUMMY_HASH);
    if (!found || !matches) throw new UnauthorizedException(SIGN_IN_MESSAGES.invalid);
    if (!found.account.active) throw new ForbiddenException(SIGN_IN_MESSAGES.inactive);
    return { token: this.tokens.sign(found.account.id), user: found.account };
  }
}
