import type { AssignableRole, Role } from './domain/roles';
import type { UserAccount } from './domain/user-accounts';

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: UserAccount;
}

export interface ChangeRoleRequest {
  role: Role;
}

export interface SetActiveRequest {
  active: boolean;
}

export interface TransferAccountingHeadRequest {
  newHolderId: string;
  previousHolderRole: AssignableRole;
}
