import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AccountsRepository } from './accounts/accounts.repository';
import { AuthController } from './auth/auth.controller';
import { AuthGuard } from './auth/auth.guard';
import { AuthService } from './auth/auth.service';
import { TokenService } from './auth/token.service';
import { PrismaService } from './database/prisma.service';
import { ExcelController } from './excel/excel.controller';
import { ExcelService } from './excel/excel.service';
import { ExcelExportService } from './excel/excel-export.service';
import { CalculationService } from './calculation/calculation.service';
import { ConfigService } from './config/config.service';
import { HealthController } from './health.controller';
@Module({
  controllers: [ExcelController, AuthController, HealthController],
  providers: [
    ExcelService,
    ExcelExportService,
    CalculationService,
    ConfigService,
    PrismaService,
    TokenService,
    AccountsRepository,
    AuthService,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule {}
