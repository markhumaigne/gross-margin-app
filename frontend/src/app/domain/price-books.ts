import { isIsoDate } from './dates';
import { productIdKey } from './manual-products';
import {
  entryFromDraft,
  entryToDraft,
  PriceBookEntry,
  PriceBookEntryDraft,
  Product,
  validateEntryDraft,
} from './pricing';
import { fail, ok, Result } from './result';

export interface PriceBook {
  id: string;
  name: string;
  description: string;
  effectiveDate: string;
  expirationDate: string | null;
  active: boolean;
  entries: PriceBookEntry[];
  updatedAt: string;
  updatedBy: string;
}

export interface PriceBookDraft {
  /** Create mode: true assigns the next PL number; false uses `id`. Ignored when editing. */
  autoId: boolean;
  id: string;
  name: string;
  description: string;
  effectiveDate: string;
  expirationDate: string;
  active: boolean;
  entries: PriceBookEntryDraft[];
}

export interface PriceBookErrors {
  id?: string;
  name?: string;
  effectiveDate?: string;
  expirationDate?: string;
  entries: Record<string, string[]>;
  form: string[];
}

export type StatusFilter = 'all' | 'active' | 'inactive';

const NOT_FOUND = 'Price book not found.';

/** POS price list IDs: PL (price list) or PS (special/promo) followed by 6 digits. */
export const PRICE_ID_PATTERN = /^(PL|PS)\d{6}$/;

export function normalizePriceId(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim().toUpperCase();
}
const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export function emptyDraft(today: string): PriceBookDraft {
  return {
    autoId: true,
    id: '',
    name: '',
    description: '',
    effectiveDate: today,
    expirationDate: '',
    active: true,
    entries: [],
  };
}

export function draftFromBook(book: PriceBook): PriceBookDraft {
  return {
    autoId: false,
    id: book.id,
    name: book.name,
    description: book.description,
    effectiveDate: book.effectiveDate,
    expirationDate: book.expirationDate ?? '',
    active: book.active,
    entries: book.entries.map(entryToDraft),
  };
}

export function newEntryDraft(
  productId: string,
  book: Pick<PriceBookDraft, 'effectiveDate' | 'expirationDate'>,
): PriceBookEntryDraft {
  return {
    productId,
    updatedPrice: '',
    promoPrice: '',
    effectiveStart: book.effectiveDate,
    effectiveEnd: book.expirationDate,
    memo: '',
  };
}

export function validatePriceBook(
  draft: PriceBookDraft,
  books: readonly PriceBook[],
  catalog: readonly Product[],
  editingId: string | null,
): PriceBookErrors {
  const errors: PriceBookErrors = { entries: Object.create(null), form: [] };
  if (editingId === null && !draft.autoId) {
    const id = normalizePriceId(draft.id);
    if (!PRICE_ID_PATTERN.test(id))
      errors.id = 'Price ID must be PL or PS followed by 6 digits (e.g. PL000123).';
    else if (books.some((b) => b.id.toUpperCase() === id))
      errors.id = `Price ID ${id} is already used.`;
  }
  const name = draft.name.trim();
  if (!name) errors.name = 'Price book name is required.';
  else if (name.length > 80) errors.name = 'Name must be 80 characters or fewer.';
  else if (books.some((b) => b.id !== editingId && sameName(b.name, name)))
    errors.name = `A price book named "${name}" already exists.`;

  const effectiveValid = isIsoDate(draft.effectiveDate);
  if (!effectiveValid) errors.effectiveDate = 'Effective date is required.';
  if (draft.expirationDate.trim()) {
    if (!isIsoDate(draft.expirationDate))
      errors.expirationDate = 'Expiration date must be a valid date.';
    else if (effectiveValid && draft.expirationDate < draft.effectiveDate)
      errors.expirationDate = 'Expiration date cannot be before the effective date.';
  }

  const seen = new Set<string>();
  for (const entry of draft.entries) {
    if (seen.has(productIdKey(entry.productId))) {
      const message = `Product ${entry.productId} is listed more than once.`;
      if (!errors.form.includes(message)) errors.form.push(message);
      continue;
    }
    seen.add(productIdKey(entry.productId));
    const product = catalog.find((p) => p.id === entry.productId);
    const entryErrors = validateEntryDraft(entry, product, draft);
    if (entryErrors.length) errors.entries[entry.productId] = entryErrors;
  }
  return errors;
}

export function hasErrors(errors: PriceBookErrors): boolean {
  return (
    !!errors.id ||
    !!errors.name ||
    !!errors.effectiveDate ||
    !!errors.expirationDate ||
    errors.form.length > 0 ||
    Object.keys(errors.entries).length > 0
  );
}

export function nextPriceBookId(books: readonly PriceBook[]): string {
  let max = 0;
  const used = new Set<string>();
  for (const b of books) {
    const match = /^PL(\d{6})$/.exec(b.id);
    if (match) {
      max = Math.max(max, Number(match[1]));
      used.add(b.id);
    }
  }
  // A manually entered/imported high ID must not overflow the six-digit POS format.
  if (max === 999999) {
    for (let n = 1; n <= 999999; n++) {
      const id = 'PL' + String(n).padStart(6, '0');
      if (!used.has(id)) return id;
    }
    return '';
  }
  return 'PL' + String(max + 1).padStart(6, '0');
}

export function savePriceBook(
  books: readonly PriceBook[],
  draft: PriceBookDraft,
  editingId: string | null,
  catalog: readonly Product[],
  actor: string,
  now: Date,
): Result<{ books: PriceBook[]; book: PriceBook }> {
  if (editingId !== null && !books.some((b) => b.id === editingId)) return fail(NOT_FOUND);
  if (hasErrors(validatePriceBook(draft, books, catalog, editingId)))
    return fail('Fix the highlighted fields before saving.');
  const id = editingId ?? (draft.autoId ? nextPriceBookId(books) : normalizePriceId(draft.id));
  if (!id) return fail('No automatic Price IDs are available. Enter an unused manual Price ID.');
  const book: PriceBook = {
    id,
    name: draft.name.trim(),
    description: draft.description.trim(),
    effectiveDate: draft.effectiveDate,
    expirationDate: draft.expirationDate.trim() ? draft.expirationDate : null,
    active: draft.active,
    entries: draft.entries.map(entryFromDraft),
    updatedAt: now.toISOString(),
    updatedBy: actor,
  };
  const next =
    editingId === null ? [...books, book] : books.map((b) => (b.id === editingId ? book : b));
  return ok({ books: next, book });
}

function copyName(books: readonly PriceBook[], name: string): string {
  for (let n = 1; ; n++) {
    const candidate = `${name} (copy${n === 1 ? '' : ' ' + n})`;
    if (!books.some((b) => sameName(b.name, candidate))) return candidate;
  }
}

export function duplicatePriceBook(
  books: readonly PriceBook[],
  id: string,
  actor: string,
  now: Date,
): Result<{ books: PriceBook[]; book: PriceBook }> {
  const source = books.find((b) => b.id === id);
  if (!source) return fail(NOT_FOUND);
  const nextId = nextPriceBookId(books);
  if (!nextId) return fail('No automatic Price IDs are available.');
  const book: PriceBook = {
    ...source,
    id: nextId,
    name: copyName(books, source.name),
    active: false,
    entries: source.entries.map((e) => ({
      ...e,
      ...(e.manual ? { manual: { ...e.manual } } : {}),
    })),
    updatedAt: now.toISOString(),
    updatedBy: actor,
  };
  return ok({ books: [...books, book], book });
}

export function setPriceBookActive(
  books: readonly PriceBook[],
  id: string,
  active: boolean,
  actor: string,
  now: Date,
): Result<PriceBook[]> {
  if (!books.some((b) => b.id === id)) return fail(NOT_FOUND);
  return ok(
    books.map((b) =>
      b.id === id ? { ...b, active, updatedAt: now.toISOString(), updatedBy: actor } : b,
    ),
  );
}

export function filterPriceBooks(
  books: readonly PriceBook[],
  query: string,
  status: StatusFilter,
): PriceBook[] {
  const q = query.trim().toLowerCase();
  return books
    .filter((b) => status === 'all' || b.active === (status === 'active'))
    .filter(
      (b) =>
        !q ||
        b.id.toLowerCase().includes(q) ||
        b.name.toLowerCase().includes(q) ||
        b.description.toLowerCase().includes(q),
    )
    .sort((a, b) => a.id.localeCompare(b.id));
}
