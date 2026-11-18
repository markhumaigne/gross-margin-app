import { isBlank, parseMoney, percentOf, toCents } from './money';

/**
 * Supplier Support on an external promotion (PS) price book row, entered by the product manager:
 * pesos per unit sold.
 */
export type Support = number;

/** Support as typed in a form; validated before it is saved. */
export type SupportDraft = string;

/** Guards against binary noise before rounding half up (all inputs here are non-negative). */
const NOISE = 1e-9;

export function validateSupportDraft(draft: SupportDraft): string | null {
  if (isBlank(draft)) return null;
  const value = parseMoney(draft);
  return value === null || value < 0 ? 'Support must be zero or more with up to 2 decimals.' : null;
}

/** Blank or unreadable values mean no Support. Call after validation. */
export function supportFromDraft(draft: SupportDraft | undefined): Support | undefined {
  if (draft === undefined || isBlank(draft)) return undefined;
  return parseMoney(draft) ?? undefined;
}

export function supportToDraft(support: Support | undefined): SupportDraft {
  return support === undefined ? '' : support.toFixed(2);
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
  if (support === undefined) return marginOnCost(price, cost);
  const netCostCents = toCents(cost) - toCents(support);
  if (netCostCents <= 0) return null;
  return percentOf(toCents(price) - netCostCents, netCostCents);
}

/** Support earned by one sales row (pesos per unit × quantity), in centavos. ₱0 rows earn none. */
export function saleSupportCents(
  support: Support,
  quantity: number,
  netSalesCents: number,
): number {
  if (netSalesCents <= 0) return 0;
  return Math.round(toCents(support) * quantity + NOISE);
}
