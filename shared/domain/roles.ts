export type Role = 'admin' | 'accounting-head' | 'product-team';
export type Permission = 'calculator' | 'price-books' | 'users';

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Admin',
  'accounting-head': 'Accounting Head',
  'product-team': 'Product Team',
};

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  admin: ['calculator', 'price-books', 'users'],
  'accounting-head': ['calculator'],
  'product-team': ['price-books'],
};

const HOME_PATHS: Record<Role, string> = {
  admin: '/calculator',
  'accounting-head': '/calculator',
  'product-team': '/price-books',
};

const PERMISSION_SEGMENTS: Record<string, Permission> = {
  calculator: 'calculator',
  // The former Sales Report page is part of the calculator now; old links redirect there.
  'sales-report': 'calculator',
  'price-books': 'price-books',
  users: 'users',
};

export function hasPermission(role: Role | null | undefined, permission: Permission): boolean {
  return !!role && ROLE_PERMISSIONS[role].includes(permission);
}

export function homePath(role: Role): string {
  return HOME_PATHS[role];
}

/** The permission guarding a URL's first path segment, or null for unguarded paths. */
export function pathPermission(url: string): Permission | null {
  const path = url.split(/[?#]/)[0];
  const segment = path.split('/').filter(Boolean)[0] ?? '';
  return PERMISSION_SEGMENTS[segment] ?? null;
}
