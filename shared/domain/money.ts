/**
 * Peso amounts are plain numbers with at most two decimals. Arithmetic happens in
 * integer centavos so totals never drift.
 */
const NOISE = 1e-6;

export function isBlank(input: unknown): boolean {
  return input === null || input === undefined || (typeof input === 'string' && !input.trim());
}

function fromNumber(value: number): number | null {
  if (!Number.isFinite(value)) return null;
  const cents = value * 100;
  const rounded = Math.round(cents);
  if (Math.abs(cents - rounded) > NOISE) return null;
  return rounded / 100;
}

/** Parses a peso amount. Returns null for blanks, text and fractions of a centavo. */
export function parseMoney(input: unknown): number | null {
  if (typeof input === 'number') return fromNumber(input);
  if (typeof input !== 'string') return null;
  let text = input.trim();
  if (!text) return null;
  let negative = false;
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1).trim();
  }
  text = text.replace(/^(₱|php)\s*/i, '');
  if (text.startsWith('-')) {
    negative = !negative;
    text = text.slice(1).trim();
  }
  if (!/^(\d{1,3}(,\d{3})+|\d+)(\.\d{1,2})?$|^\.\d{1,2}$/.test(text)) return null;
  const value = fromNumber(Number(text.replace(/,/g, '')));
  if (value === null) return null;
  return negative ? -value : value;
}

export function toCents(pesos: number): number {
  return Math.round(pesos * 100);
}

export function fromCents(cents: number): number {
  return cents / 100;
}

/** numerator ÷ denominator × 100, rounded half away from zero to 2 decimals. */
export function percentOf(numeratorCents: number, denominatorCents: number): number | null {
  if (denominatorCents === 0) return null;
  const sign = Math.sign(numeratorCents) * Math.sign(denominatorCents);
  const scaled = (Math.abs(numeratorCents) * 10000) / Math.abs(denominatorCents);
  const rounded = Math.round(scaled + NOISE);
  const result = (sign * rounded) / 100;
  return result === 0 ? 0 : result;
}
