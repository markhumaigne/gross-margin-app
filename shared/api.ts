import type { AssignableRole, Role } from './domain/roles';
import type { BookImportSummary } from './domain/price-book-import';
import type { PriceBook, PriceBookDraft, PricingSnapshot } from './domain/price-books';
import type { UserAccount } from './domain/user-accounts';
import type { ZenposPriceBook } from './domain/zenpos-price-book';

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

export interface SavePriceBookRequest {
  draft: PriceBookDraft;
  /** The `updatedAt` of the book when it was opened; a different stored value refuses the save. */
  expectedUpdatedAt?: string;
}

export interface PriceBookWriteResponse {
  book: PriceBook;
  pricing: PricingSnapshot;
}

export interface PriceBookImportRequest {
  fileName: string;
  book: ZenposPriceBook;
}

export interface PriceBookImportResponse {
  summary: BookImportSummary;
  pricing: PricingSnapshot;
}
