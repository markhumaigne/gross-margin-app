import assert from 'node:assert/strict';
import { expectFail, expectOk, test } from './harness';
import {
  NOT_A_PRICE_BOOK,
  parseZenposPriceBook,
  zenposProductId,
} from '../src/app/domain/zenpos-price-book';
import {
  buildSamplePriceBookWorkbook,
  SAMPLE_PRICE_BOOK_FILE_NAME,
} from '../src/app/domain/sample-price-book-file';
import { readSpreadsheet } from '../src/app/domain/read-spreadsheet';

const HEADER = [
  'Product ID',
  'Name',
  'Qty',
  'to Qty',
  'Unit',
  'Unit Price',
  'Discount',
  'Disc %',
  'Price After \n Discount',
  'Stnd Cost',
  'Margin',
];
const SONY_BLACK = [
  4548736146242,
  'SONY SRX-XB100 BLACK',
  0,
  99999,
  'PCS',
  2499,
  null,
  null,
  2499,
  2387,
  '4.7%',
];
const SONY_BLUE = [
  4548736146266,
  'SONY SRX-XB100 BLUE',
  0,
  99999,
  'PCS',
  2499,
  null,
  null,
  2499,
  2399.2,
  '4.2%',
];

/** Rows in the ZenPOS "Price Book" export layout (labels in A/B, product header on row 19). */
function zenpos(
  o: { priceId?: unknown; active?: string; period?: string; products?: unknown[][] } = {},
): unknown[][] {
  return [
    ['ITECH TRADING'],
    ['Price Book'],
    [],
    [],
    [],
    [],
    ['Price ID:', o.priceId ?? 'PS000005'],
    ['Name:', 'SONY HEADSET NOVEMBER 2026 PROMO'],
    ['Active:', o.active ?? 'Yes'],
    ['Memo:', 'REF#: 2026002485\nNOV. 06 - NOV. 13, 2026'],
    ['Limited Period:', o.period ?? 'Yes (11/06/2026~11/19/2026)'],
    ['Limited Days:', 'No'],
    ['Limited Time:', 'No'],
    ['Limited Regions:', 'No'],
    ['Limited Branches:', 'Yes (GAME ONE ONLINE)'],
    ['Limited Price Levels:', 'No'],
    [],
    [],
    HEADER,
    ...(o.products ?? [SONY_BLACK, SONY_BLUE]),
  ];
}

test('reads the header block and product rows of a ZenPOS export', () => {
  const book = expectOk(parseZenposPriceBook(zenpos()));
  assert.deepEqual(
    [book.priceId, book.name, book.active, book.memo, book.period, book.skippedRows],
    [
      'PS000005',
      'SONY HEADSET NOVEMBER 2026 PROMO',
      true,
      'REF#: 2026002485\nNOV. 06 - NOV. 13, 2026',
      { start: '2026-11-06', end: '2026-11-19' },
      0,
    ],
  );
  assert.equal(book.products.length, 2);
  assert.deepEqual(book.products[0], {
    productId: '4548736146242',
    name: 'SONY SRX-XB100 BLACK',
    qty: 0,
    toQty: 99999,
    unit: 'PCS',
    unitPrice: 2499,
    discount: 0,
    discountPercent: 0,
    netPrice: 2499,
    cost: 2387,
  });
  assert.equal(book.products[1].cost, 2399.2);
});

test('barcodes keep every digit and text IDs keep leading zeros', () => {
  assert.equal(zenposProductId(4548736146242), '4548736146242');
  assert.equal(zenposProductId(' 097855213693 '), '097855213693');
  assert.equal(zenposProductId(null), '');
});

test('formatted text amounts are read', () => {
  const row = [
    '097855213693',
    'TEXT ROW',
    '0',
    '99999',
    'PCS',
    '5,190.00',
    '',
    '',
    '5,190.00',
    '4,750.00',
    '9.3%',
  ];
  const [product] = expectOk(parseZenposPriceBook(zenpos({ products: [row] }))).products;
  assert.deepEqual(
    [
      product.productId,
      product.unitPrice,
      product.netPrice,
      product.cost,
      product.qty,
      product.toQty,
    ],
    ['097855213693', 5190, 5190, 4750, 0, 99999],
  );
});

test('Limited Period No and Active No', () => {
  const book = expectOk(parseZenposPriceBook(zenpos({ period: 'No', active: 'No' })));
  assert.equal(book.period, null);
  assert.equal(book.active, false);
});

test('blank IDs, unreadable prices and repeated IDs are skipped and counted', () => {
  const book = expectOk(
    parseZenposPriceBook(
      zenpos({
        products: [
          SONY_BLACK,
          [null, 'NO ID', 0, 99999, 'PCS', 100, null, null, 100, 50, '100%'],
          [4548736146266, 'BAD PRICE', 0, 99999, 'PCS', 100, null, null, 'n/a', 50, ''],
          [],
          [' 4548736146242 ', 'REPEATED', 0, 99999, 'PCS', 100, null, null, 100, 50, ''],
        ],
      }),
    ),
  );
  assert.deepEqual(
    book.products.map((p) => p.productId),
    ['4548736146242'],
  );
  assert.equal(book.skippedRows, 3);
});

test('files that are not ZenPOS price books are rejected', () => {
  const sales = [
    ['Product ID', 'Product Name', 'Qty', 'Net Total'],
    ['A-1', 'Item', 1, 100],
  ];
  assert.equal(expectFail(parseZenposPriceBook(sales)), NOT_A_PRICE_BOOK);
  assert.equal(
    expectFail(parseZenposPriceBook(zenpos({ priceId: 'PX000001' }))),
    'Price ID PX000001 is not PL, PS or PI followed by 6 digits.',
  );
  assert.equal(
    expectFail(parseZenposPriceBook(zenpos({ products: [] }))),
    'The price book has no product rows.',
  );
});

test('the sample price book file parses', async () => {
  const rows = await readSpreadsheet(
    new File([await buildSamplePriceBookWorkbook()], SAMPLE_PRICE_BOOK_FILE_NAME),
  );
  const book = expectOk(parseZenposPriceBook(rows));
  assert.equal(book.priceId, 'PS000015');
  assert.equal(book.name, 'Demo Headset Promo');
  assert.deepEqual(book.period, { start: '2026-11-01', end: '2026-11-30' });
  assert.deepEqual(
    book.products.map((p) => [p.productId, p.netPrice, p.cost]),
    [
      ['4800000600016', 2795, 1960],
      ['4800000600023', 1995, 1500],
      ['0480000060003', 1495, 1100],
    ],
  );
});

test('IDs a spreadsheet program turned into scientific notation fail the whole file', () => {
  const mangled = [
    '4.54874E+12',
    'SONY SRX-XB100 BLUE',
    0,
    99999,
    'PCS',
    2499,
    '',
    '',
    2499,
    2399.2,
    '',
  ];
  assert.equal(
    expectFail(parseZenposPriceBook(zenpos({ products: [SONY_BLACK, mangled] }))),
    'Product IDs were changed to scientific notation (4.54874E+12) by a spreadsheet program. ' +
      'Import the original ZenPOS .xlsx export instead.',
  );
});
