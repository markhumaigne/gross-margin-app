import { inject } from '@angular/core';
import { CanActivateChildFn, CanActivateFn, Router } from '@angular/router';
import { hasPermission, homePath, pathPermission, Permission, Role } from '../../../../shared/domain/roles';
import { AuthService } from './auth.service';

/** Signed-out visitors go to the sign-in page and come back afterwards. */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  if (auth.currentUser()) return true;
  return inject(Router).createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};

/** Blocks routes whose `data.permission` the signed-in role does not hold. */
export const permissionGuard: CanActivateChildFn = (route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.currentUser())
    return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
  const permission = route.data['permission'] as Permission | undefined;
  if (!permission || auth.can(permission)) return true;
  return router.createUrlTree(['/forbidden']);
};

/** Signed-in users skip the sign-in page. */
export const guestGuard: CanActivateFn = () => {
  const role = inject(AuthService).role();
  return role ? inject(Router).parseUrl(homePath(role)) : true;
};

/** Sends `/` to the signed-in role's home page. */
export const homeRedirectGuard: CanActivateFn = () => {
  const role = inject(AuthService).role();
  return inject(Router).parseUrl(role ? homePath(role) : '/login');
};

/** A same-site return URL the role may open, otherwise the role's home page. */
export function safeReturnUrl(url: string | null, role: Role): string {
  if (!url || !url.startsWith('/') || url.startsWith('//')) return homePath(role);
  const permission = pathPermission(url);
  return !permission || hasPermission(role, permission) ? url : homePath(role);
}
