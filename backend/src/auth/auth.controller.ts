import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import type { LoginRequest, LoginResponse } from '../../../shared/api';
import type { UserAccount } from '../../../shared/domain/user-accounts';
import { AuthService } from './auth.service';
import { CurrentUser, Public } from './permissions';

@Controller('api/auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  login(@Body() body: Partial<LoginRequest> | undefined): Promise<LoginResponse> {
    return this.auth.signIn(body?.username as string, body?.password as string);
  }

  /** Tokens live in browser memory only; there is nothing to revoke on the server. */
  @Post('logout')
  @HttpCode(204)
  logout(): void {}

  @Get('me')
  me(@CurrentUser() user: UserAccount): UserAccount {
    return user;
  }
}
