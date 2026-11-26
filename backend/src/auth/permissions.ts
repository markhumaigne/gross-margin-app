import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Permission } from '../../../shared/domain/roles';
import type { UserAccount } from '../../../shared/domain/user-accounts';

export const PUBLIC_KEY = 'auth:public';
export const PERMISSIONS_KEY = 'auth:permissions';

export const SIGN_IN_AGAIN = 'Sign in again to continue.';

/** Fixed 403 message for each permission. */
export const DENIED_MESSAGES: Record<Permission, string> = {
  calculator: 'You do not have permission to use the bank rate calculator.',
  'price-books': 'You do not have permission to manage price books.',
  users: 'You do not have permission to manage user accounts.',
};

/** Skips the sign-in requirement. */
export const Public = () => SetMetadata(PUBLIC_KEY, true);

/** The signed-in user must hold at least one of these permissions. */
export const RequirePermission = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

/** The account the guard resolved for this request. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): UserAccount =>
    context.switchToHttp().getRequest<{ user: UserAccount }>().user,
);
