import { PriceBook } from '../domain/price-books';

/** Demonstration price books. Prices are mock values for frontend testing only. */
export const SEED_PRICE_BOOKS: readonly PriceBook[] = [
  {
    id: 'PL000013',
    name: 'Standard Retail 2026',
    description: 'Everyday shelf prices for all branches.',
    effectiveDate: '2026-01-01',
    expirationDate: null,
    active: true,
    entries: [
      {
        productId: '4800000100011',
        updatedPrice: 5595,
        promoPrice: null,
        effectiveStart: '2026-01-01',
        effectiveEnd: null,
        memo: '',
      },
      {
        productId: '4800000200014',
        updatedPrice: 1395,
        promoPrice: null,
        effectiveStart: '2026-01-01',
        effectiveEnd: null,
        memo: '',
      },
    ],
    updatedAt: '2026-10-05T01:30:00.000Z',
    updatedBy: 'Demo Product Lead',
  },
  {
    id: 'PL000030',
    name: 'November Monitor Sale',
    description: 'Monitor promotion for November.',
    effectiveDate: '2026-11-01',
    expirationDate: '2026-11-30',
    active: true,
    entries: [
      {
        productId: '4800000100011',
        updatedPrice: null,
        promoPrice: 4995,
        effectiveStart: '2026-11-01',
        effectiveEnd: '2026-11-30',
        memo: '',
      },
      {
        productId: '4800000100028',
        updatedPrice: null,
        promoPrice: 13995,
        effectiveStart: '2026-11-01',
        effectiveEnd: '2026-11-30',
        memo: '',
      },
    ],
    updatedAt: '2026-10-28T06:15:00.000Z',
    updatedBy: 'Demo Product Lead',
  },
  {
    id: 'PL000034',
    name: 'December Holiday Promo',
    description: 'Holiday bundle pricing; awaiting approval.',
    effectiveDate: '2026-12-01',
    expirationDate: '2026-12-31',
    active: false,
    entries: [
      {
        productId: '4800000300017',
        updatedPrice: null,
        promoPrice: 41995,
        effectiveStart: '2026-12-01',
        effectiveEnd: '2026-12-31',
        memo: '',
      },
      {
        productId: '4800000200014',
        updatedPrice: null,
        promoPrice: 1099,
        effectiveStart: '2026-12-01',
        effectiveEnd: '2026-12-31',
        memo: '',
      },
    ],
    updatedAt: '2026-11-12T03:45:00.000Z',
    updatedBy: 'Demo Product Lead',
  },
];
