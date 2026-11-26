import { BadRequestException, Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { z } from 'zod';
import type {
  ChangeRoleRequest,
  SetActiveRequest,
  TransferAccountingHeadRequest,
} from '../../../shared/api';
import type { NewUserDraft, UserAccount } from '../../../shared/domain/user-accounts';
import { CurrentUser, RequirePermission } from '../auth/permissions';
import { AccountsService } from './accounts.service';

const role = z.enum(['admin', 'accounting-head', 'product-team']);
const assignableRole = z.enum(['admin', 'product-team']);

const draftSchema = z
  .object({
    username: z.string().trim().max(32),
    displayName: z.string().trim().max(100),
    // Not trimmed: sign-in compares the password exactly as typed.
    password: z.string().max(200),
    role,
  })
  .strict();
const roleSchema = z.object({ role }).strict();
const activeSchema = z.object({ active: z.boolean() }).strict();
const transferSchema = z
  .object({ newHolderId: z.string().trim().max(100), previousHolderRole: assignableRole })
  .strict();

function parse<S extends z.ZodTypeAny>(schema: S, body: unknown): z.infer<S> {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new BadRequestException('The request is not valid.');
  return parsed.data;
}

@Controller('api/users')
@RequirePermission('users')
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Get()
  list(): Promise<UserAccount[]> {
    return this.accounts.list();
  }

  @Post()
  add(@CurrentUser() actor: UserAccount, @Body() body: NewUserDraft): Promise<UserAccount[]> {
    return this.accounts.add(actor, parse(draftSchema, body));
  }

  @Post('accounting-head')
  transfer(
    @CurrentUser() actor: UserAccount,
    @Body() body: TransferAccountingHeadRequest,
  ): Promise<UserAccount[]> {
    const { newHolderId, previousHolderRole } = parse(transferSchema, body);
    return this.accounts.transferAccountingHead(actor, newHolderId, previousHolderRole);
  }

  @Patch(':id/role')
  changeRole(
    @CurrentUser() actor: UserAccount,
    @Param('id') id: string,
    @Body() body: ChangeRoleRequest,
  ): Promise<UserAccount[]> {
    return this.accounts.changeRole(actor, id, parse(roleSchema, body).role);
  }

  @Patch(':id/active')
  setActive(
    @CurrentUser() actor: UserAccount,
    @Param('id') id: string,
    @Body() body: SetActiveRequest,
  ): Promise<UserAccount[]> {
    return this.accounts.setActive(actor, id, parse(activeSchema, body).active);
  }
}
