import { parseMoney } from './money';

/** A price book row's own product details, from a ZenPOS price book import or manual entry. */
export interface ManualProduct {
  name: string;
  qty: number;
  toQty: number | null;
  unit: string;
  masterListPrice: number;
  unitPrice: number;
  discountPercent: number;
  discount: number;
  netPrice: number;
  cost: number;
}

export type ManualProductDraft = { [K in keyof ManualProduct]: string };
export type ManualProductField = keyof ManualProductDraft;
export type ManualProductErrors = Partial<Record<ManualProductField | 'productId', string>>;

export const MANUAL_PRODUCT_FIELDS: readonly {
  key: ManualProductField;
  label: string;
  kind: 'text' | 'quantity' | 'money' | 'percent';
  optional?: boolean;
}[] = [
  { key: 'name', label: 'Name', kind: 'text' },
  { key: 'qty', label: 'Qty', kind: 'quantity' },
  { key: 'toQty', label: 'to Qty', kind: 'quantity', optional: true },
  { key: 'unit', label: 'Unit', kind: 'text' },
  { key: 'masterListPrice', label: 'Master List Price', kind: 'money' },
  { key: 'unitPrice', label: 'Unit Price', kind: 'money' },
  { key: 'discountPercent', label: 'Disc %', kind: 'percent' },
  { key: 'discount', label: 'Discount', kind: 'money' },
  { key: 'netPrice', label: 'Net Price', kind: 'money' },
  { key: 'cost', label: 'Cost', kind: 'money' },
];

export function emptyManualProduct(): ManualProductDraft {
  return {
    name: '',
    qty: '1',
    toQty: '',
    unit: 'PCS',
    masterListPrice: '',
    unitPrice: '',
    discountPercent: '0',
    discount: '0',
    netPrice: '',
    cost: '',
  };
}

export const productIdKey = (id: string) => id.trim().toUpperCase();

function quantity(value: string): number | null {
  const text = value.trim();
  const number = Number(text);
  return /^(\d+(\.\d+)?|\.\d+)(e[+-]?\d+)?$/i.test(text) &&
    number >= 0 &&
    number <= Number.MAX_SAFE_INTEGER
    ? number
    : null;
}

export function validateManualProduct(
  productId: string,
  draft: ManualProductDraft,
  excludedIds: readonly string[] = [],
): ManualProductErrors {
  const errors: ManualProductErrors = {};
  if (!productId.trim()) errors.productId = 'Product ID is required.';
  else if (excludedIds.some((id) => productIdKey(id) === productIdKey(productId)))
    errors.productId = 'This Product ID is already in the price book.';
  for (const field of MANUAL_PRODUCT_FIELDS) {
    const text = draft[field.key];
    if (field.optional && !text.trim()) continue;
    if (field.kind === 'text') {
      if (!text.trim()) errors[field.key] = `${field.label} is required.`;
    } else if (field.kind === 'quantity') {
      if (quantity(text) === null) errors[field.key] = `${field.label} must be zero or more.`;
    } else {
      const value = parseMoney(text);
      if (value === null || value < 0)
        errors[field.key] = `${field.label} must be zero or more with up to 2 decimals.`;
      else if (field.key === 'discountPercent' && value > 100)
        errors.discountPercent = 'Disc % must be between 0 and 100.';
    }
  }
  const from = quantity(draft.qty);
  const to = quantity(draft.toQty);
  if (from !== null && to !== null && to < from)
    errors.toQty = 'to Qty must be greater than or equal to Qty.';
  return errors;
}

/** Call only after validation. User-entered discounts are preserved; margins are calculated. */
export function manualProductFromDraft(draft: ManualProductDraft): ManualProduct {
  return {
    name: draft.name.trim(),
    qty: Number(draft.qty),
    toQty: draft.toQty.trim() ? Number(draft.toQty) : null,
    unit: draft.unit.trim(),
    masterListPrice: parseMoney(draft.masterListPrice)!,
    unitPrice: parseMoney(draft.unitPrice)!,
    discountPercent: parseMoney(draft.discountPercent)!,
    discount: parseMoney(draft.discount)!,
    netPrice: parseMoney(draft.netPrice)!,
    cost: parseMoney(draft.cost)!,
  };
}

export function manualProductToDraft(product: ManualProduct): ManualProductDraft {
  return {
    name: product.name,
    qty: String(product.qty),
    toQty: product.toQty === null ? '' : String(product.toQty),
    unit: product.unit,
    masterListPrice: product.masterListPrice.toFixed(2),
    unitPrice: product.unitPrice.toFixed(2),
    discountPercent: product.discountPercent.toFixed(2),
    discount: product.discount.toFixed(2),
    netPrice: product.netPrice.toFixed(2),
    cost: product.cost.toFixed(2),
  };
}
