import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { hasPermission, Permission } from '../../../shared/domain/roles';
import type { UserAccount } from '../../../shared/domain/user-accounts';
import { AccountsRepository } from '../accounts/accounts.repository';
import { DENIED_MESSAGES, PERMISSIONS_KEY, PUBLIC_KEY, SIGN_IN_AGAIN } from './permissions';
import { TokenService } from './token.service';

interface AuthedRequest {
  headers: Record<string, string | string[] | undefined>;
  user?: UserAccount;
}

/** Every route needs a signed-in, active user unless it is @Public(). The user is re-read each time. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly accounts: AccountsRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, targets)) return true;

    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const header = request.headers['authorization'];
    const token = typeof header === 'string' ? /^Bearer (\S+)$/.exec(header)?.[1] : undefined;
    const userId = token ? this.tokens.verify(token) : null;
    const user = userId ? await this.accounts.findById(userId) : null;
    if (!user || !user.active) throw new UnauthorizedException(SIGN_IN_AGAIN);
    request.user = user;

    const required = this.reflector.getAllAndOverride<Permission[] | undefined>(
      PERMISSIONS_KEY,
      targets,
    );
    if (required?.length && !required.some((p) => hasPermission(user.role, p)))
      throw new ForbiddenException(DENIED_MESSAGES[required[0]]);
    return true;
  }
}
