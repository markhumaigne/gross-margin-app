import { fromCents, isBlank, parseMoney, percentOf, toCents } from './money';

/**
 * Supplier Support on an external promotion (PS) price book row, entered by the product manager:
 * pesos per unit sold, or a percent of the selling price.
 */
export type SupportKind = 'amount' | 'percent';

export interface Support {
  kind: SupportKind;
  value: number;
}

/** Form values for Support; the value stays as typed until validated. */
export interface SupportDraft {
  kind: SupportKind;
  value: string;
}

export const NO_SUPPORT_DRAFT: SupportDraft = Object.freeze({ kind: 'amount', value: '' });

/** Guards against binary noise before rounding half up (all inputs here are non-negative). */
const NOISE = 1e-9;

export function validateSupportDraft(draft: SupportDraft): string | null {
  if (isBlank(draft.value)) return null;
  const value = parseMoney(draft.value);
  if (value === null || value < 0) return 'Support must be zero or more with up to 2 decimals.';
  if (draft.kind === 'percent' && value > 100) return 'Support % cannot exceed 100.';
  return null;
}

/** Blank or unreadable values mean no Support. Call after validation. */
export function supportFromDraft(draft: SupportDraft | undefined): Support | undefined {
  if (!draft || isBlank(draft.value)) return undefined;
  const value = parseMoney(draft.value);
  return value === null ? undefined : { kind: draft.kind, value };
}

export function supportToDraft(support: Support | undefined): SupportDraft {
  return support
    ? { kind: support.kind, value: support.value.toFixed(2) }
    : { ...NO_SUPPORT_DRAFT };
}

/** Pesos of Support for one unit sold at `price`, rounded to the centavo. */
export function supportPerUnit(price: number, support: Support): number {
  if (support.kind === 'amount') return support.value;
  return fromCents(Math.round((toCents(price) * support.value) / 100 + NOISE));
}

/** ZenPOS margin: (price − cost) ÷ cost × 100. Null when cost is not positive. */
export function marginOnCost(price: number, cost: number): number | null {
  const costCents = toCents(cost);
  if (costCents <= 0) return null;
  return percentOf(toCents(price) - costCents, costCents);
}

/** Margin on cost after Support lowers the cost; null when the net cost is not positive. */
export function marginAfterSupport(
  price: number,
  cost: number,
  support: Support | undefined,
): number | null {
  if (!support) return marginOnCost(price, cost);
  const netCostCents = toCents(cost) - toCents(supportPerUnit(price, support));
  if (netCostCents <= 0) return null;
  return percentOf(toCents(price) - netCostCents, netCostCents);
}

/** Support earned by one sales row, in centavos. Rows sold at ₱0 earn none. */
export function saleSupportCents(
  support: Support,
  quantity: number,
  netSalesCents: number,
): number {
  if (netSalesCents <= 0) return 0;
  if (support.kind === 'amount') return Math.round(toCents(support.value) * quantity + NOISE);
  return Math.round((netSalesCents * support.value) / 100 + NOISE);
}
