import type { UserAccount } from './domain/user-accounts';

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: UserAccount;
}
