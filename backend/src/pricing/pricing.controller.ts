import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { z } from 'zod';
import type {
  PriceBookImportRequest,
  PriceBookImportResponse,
  PriceBookWriteResponse,
  SavePriceBookRequest,
  SetActiveRequest,
} from '../../../shared/api';
import type { PriceBookDraft, PricingSnapshot } from '../../../shared/domain/price-books';
import type { UserAccount } from '../../../shared/domain/user-accounts';
import { CurrentUser, RequirePermission } from '../auth/permissions';
import { activeSchema, draftSchema, importSchema, saveSchema } from './pricing.schemas';
import { PricingService } from './pricing.service';

function parse<S extends z.ZodTypeAny>(schema: S, body: unknown): z.infer<S> {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new BadRequestException('The request is not valid.');
  return parsed.data;
}

@Controller('api')
@RequirePermission('price-books')
export class PricingController {
  constructor(private readonly pricing: PricingService) {}

  @Get('pricing')
  @RequirePermission('price-books', 'calculator')
  snapshot(): Promise<PricingSnapshot> {
    return this.pricing.snapshot();
  }

  @Post('price-books')
  create(
    @CurrentUser() actor: UserAccount,
    @Body() body: PriceBookDraft,
  ): Promise<PriceBookWriteResponse> {
    return this.pricing.create(actor, parse(draftSchema, body));
  }

  @Post('price-books/import')
  importBook(
    @CurrentUser() actor: UserAccount,
    @Body() body: PriceBookImportRequest,
  ): Promise<PriceBookImportResponse> {
    const { fileName, book } = parse(importSchema, body);
    return this.pricing.importBook(actor, fileName, book);
  }

  @Put('price-books/:id')
  update(
    @CurrentUser() actor: UserAccount,
    @Param('id') id: string,
    @Body() body: SavePriceBookRequest,
  ): Promise<PriceBookWriteResponse> {
    const { draft, expectedUpdatedAt } = parse(saveSchema, body);
    return this.pricing.update(actor, id, draft, expectedUpdatedAt);
  }

  @Post('price-books/:id/duplicate')
  duplicate(
    @CurrentUser() actor: UserAccount,
    @Param('id') id: string,
  ): Promise<PriceBookWriteResponse> {
    return this.pricing.duplicate(actor, id);
  }

  @Patch('price-books/:id/active')
  setActive(
    @CurrentUser() actor: UserAccount,
    @Param('id') id: string,
    @Body() body: SetActiveRequest,
  ): Promise<PriceBookWriteResponse> {
    return this.pricing.setActive(actor, id, parse(activeSchema, body).active);
  }

  @Delete('price-books/:id')
  remove(@Param('id') id: string): Promise<PricingSnapshot> {
    return this.pricing.remove(id);
  }
}
