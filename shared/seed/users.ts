import { UserAccount } from '../domain/user-accounts';

/** A seed account with its demo password; the password is hashed before it is stored. */
export interface SeedUser extends UserAccount {
  password: string;
}

/**
 * The seeded starter accounts. Their passwords are public development passwords (see README);
 * change or deactivate them before any real use.
 */
export const SEED_USERS: readonly SeedUser[] = [
  {
    id: 'u-1',
    username: 'admin',
    displayName: 'Demo Admin',
    password: 'Admin123!',
    role: 'admin',
    active: true,
  },
  {
    id: 'u-2',
    username: 'accounting',
    displayName: 'Demo Accountant',
    password: 'Accounting123!',
    role: 'accounting-head',
    active: true,
  },
  {
    id: 'u-3',
    username: 'productteam',
    displayName: 'Demo Product Lead',
    password: 'Product123!',
    role: 'product-team',
    active: true,
  },
];
