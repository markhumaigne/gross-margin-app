import { isDeepStrictEqual } from 'node:util';
import type {
  PriceBook as PriceBookRow,
  PriceBookEntry as PriceBookEntryRow,
  Prisma,
  User as UserRow,
} from '../generated/prisma/client';
import type { ManualProduct } from '../../../shared/domain/manual-products';
import type { Role } from '../../../shared/domain/roles';
import type { UserAccount } from '../../../shared/domain/user-accounts';
import type { PriceBook } from '../../../shared/domain/price-books';
import type { PriceBookEntry } from '../../../shared/domain/pricing';

/** Calendar dates are stored as UTC midnight so no time zone can shift them. */
export const isoDate = (value: Date): string =>
  String(value.getUTCFullYear()).padStart(4, '0') +
  '-' +
  String(value.getUTCMonth() + 1).padStart(2, '0') +
  '-' +
  String(value.getUTCDate()).padStart(2, '0');

export const dateValue = (iso: string): Date => new Date(iso + 'T00:00:00.000Z');

const toMoney = (value: number): string => value.toFixed(2);
const money = (d: Prisma.Decimal): number => Number(d.toFixed(2));
const moneyOrNull = (d: Prisma.Decimal | null): number | null => (d === null ? null : money(d));
const moneyOrAbsent = (value: number | undefined): string | null =>
  value === undefined ? null : toMoney(value);

/** The account as the browser may see it: the password hash is never copied. */
export function userFromRow(row: UserRow): UserAccount {
  return {
    id: row.id,
    username: row.username,
    displayName: row.displayName,
    role: row.role as Role,
    active: row.active,
  };
}

/** Every entry carries its own product details; a row without them is refused, never filled in. */
function manualFromRow(bookId: string, row: PriceBookEntryRow): ManualProduct {
  if (
    row.manualName === null ||
    row.manualQty === null ||
    row.manualUnit === null ||
    row.manualMasterListPrice === null ||
    row.manualUnitPrice === null ||
    row.manualDiscountPercent === null ||
    row.manualDiscount === null ||
    row.manualNetPrice === null ||
    row.manualCost === null
  )
    throw new Error(
      `Price book ${bookId} has no product details for product ${row.productId}. ` +
        'Re-import the price book from ZenPOS or enter the product manually.',
    );
  return {
    name: row.manualName,
    qty: row.manualQty,
    toQty: row.manualToQty,
    unit: row.manualUnit,
    masterListPrice: money(row.manualMasterListPrice),
    unitPrice: money(row.manualUnitPrice),
    discountPercent: money(row.manualDiscountPercent),
    discount: money(row.manualDiscount),
    netPrice: money(row.manualNetPrice),
    cost: money(row.manualCost),
  };
}

function entryFromRow(bookId: string, row: PriceBookEntryRow): PriceBookEntry {
  const entry: PriceBookEntry = {
    productId: row.productId,
    updatedPrice: moneyOrNull(row.updatedPrice),
    promoPrice: moneyOrNull(row.promoPrice),
    effectiveStart: isoDate(row.effectiveStart),
    effectiveEnd: row.effectiveEnd === null ? null : isoDate(row.effectiveEnd),
    memo: row.memo,
    manual: manualFromRow(bookId, row),
  };
  if (row.support !== null) entry.support = money(row.support);
  return entry;
}

export function bookFromRow(row: PriceBookRow & { entries: PriceBookEntryRow[] }): PriceBook {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    effectiveDate: isoDate(row.effectiveDate),
    expirationDate: row.expirationDate === null ? null : isoDate(row.expirationDate),
    active: row.active,
    entries: [...row.entries]
      .sort((a, b) => a.position - b.position)
      .map((e) => entryFromRow(row.id, e)),
    updatedAt: row.updatedAt.toISOString(),
    updatedBy: row.updatedBy,
  };
}

export function bookToRows(book: PriceBook): {
  book: Prisma.PriceBookCreateManyInput;
  entries: Prisma.PriceBookEntryCreateManyInput[];
} {
  return {
    book: {
      id: book.id,
      name: book.name,
      description: book.description,
      effectiveDate: dateValue(book.effectiveDate),
      expirationDate: book.expirationDate === null ? null : dateValue(book.expirationDate),
      active: book.active,
      updatedAt: new Date(book.updatedAt),
      updatedBy: book.updatedBy,
    },
    entries: book.entries.map((e, position) => ({
      priceBookId: book.id,
      position,
      productId: e.productId,
      updatedPrice: e.updatedPrice === null ? null : toMoney(e.updatedPrice),
      promoPrice: e.promoPrice === null ? null : toMoney(e.promoPrice),
      effectiveStart: dateValue(e.effectiveStart),
      effectiveEnd: e.effectiveEnd === null ? null : dateValue(e.effectiveEnd),
      memo: e.memo,
      support: moneyOrAbsent(e.support),
      manualName: e.manual.name,
      manualQty: e.manual.qty,
      manualToQty: e.manual.toQty,
      manualUnit: e.manual.unit,
      manualMasterListPrice: toMoney(e.manual.masterListPrice),
      manualUnitPrice: toMoney(e.manual.unitPrice),
      manualDiscountPercent: toMoney(e.manual.discountPercent),
      manualDiscount: toMoney(e.manual.discount),
      manualNetPrice: toMoney(e.manual.netPrice),
      manualCost: toMoney(e.manual.cost),
    })),
  };
}

/** Books that must be written (new or changed by value, not key order) and ids to delete. */
export function diffBooks(
  before: readonly PriceBook[],
  after: readonly PriceBook[],
): { upserts: PriceBook[]; deletes: string[] } {
  const old = new Map(before.map((b) => [b.id, b]));
  const kept = new Set(after.map((b) => b.id));
  return {
    upserts: after.filter((b) => !isDeepStrictEqual(old.get(b.id), b)),
    deletes: before.filter((b) => !kept.has(b.id)).map((b) => b.id),
  };
}
