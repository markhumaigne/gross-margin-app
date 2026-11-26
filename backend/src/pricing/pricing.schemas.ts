import { z } from 'zod';
import { PRICE_ID_PATTERN } from '../../../shared/domain/price-books';

const MAX_ROWS = 20_000;
const text = z.string().max(500);
const id = z.string().max(100);
const amount = z.number().finite().min(0);

const manualDraft = z
  .object({
    name: text,
    qty: text,
    toQty: text,
    unit: text,
    masterListPrice: text,
    unitPrice: text,
    discountPercent: text,
    discount: text,
    netPrice: text,
    cost: text,
  })
  .strict();

const entryDraft = z
  .object({
    manual: manualDraft.optional(),
    productId: id,
    updatedPrice: text,
    promoPrice: text,
    effectiveStart: text,
    effectiveEnd: text,
    memo: text,
    support: text.optional(),
  })
  .strict();

export const draftSchema = z
  .object({
    autoId: z.boolean(),
    id,
    name: text,
    description: text,
    effectiveDate: text,
    expirationDate: text,
    active: z.boolean(),
    entries: z.array(entryDraft).max(MAX_ROWS),
  })
  .strict();

export const saveSchema = z
  .object({ draft: draftSchema, expectedUpdatedAt: text.optional() })
  .strict();

export const activeSchema = z.object({ active: z.boolean() }).strict();

const zenposRow = z
  .object({
    productId: id,
    name: text,
    qty: amount,
    toQty: amount.nullable(),
    unit: text,
    unitPrice: amount,
    discount: amount,
    discountPercent: amount,
    netPrice: amount,
    cost: amount,
  })
  .strict();

export const importSchema = z
  .object({
    fileName: text,
    book: z
      .object({
        priceId: z.string().regex(PRICE_ID_PATTERN),
        name: text,
        active: z.boolean(),
        memo: text,
        period: z.object({ start: text, end: text }).strict().nullable(),
        products: z.array(zenposRow).max(MAX_ROWS),
        skippedRows: amount,
      })
      .strict(),
  })
  .strict();
