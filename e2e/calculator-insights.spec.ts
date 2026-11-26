import { test, expect, Page } from './fixtures';
import * as XLSX from 'xlsx';
import { SAMPLE_EXPORT_ROWS } from '../frontend/src/app/mock-data/sample-export';
import { SAMPLE_PRICE_BOOK_ROWS } from '../frontend/src/app/mock-data/sample-price-book';
import { ACCOUNTS, signIn, signOut } from './helpers';

function sampleFile() {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(SAMPLE_EXPORT_ROWS.map((r) => [...r])),
    'Sales Report by Product',
  );
  return {
    name: 'Sample Sales Report by Product.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer,
  };
}

async function uploadAndCalculate(page: Page) {
  await page.getByLabel('Upload Sales Report', { exact: true }).setInputFiles(sampleFile());
  const calculate = page.getByRole('button', { name: 'Calculate Bank Rate Deductions' });
  await expect(calculate).toBeEnabled();
  await calculate.click();
  await expect(page.getByRole('table', { name: 'Calculated Sales Report' })).toBeVisible();
}

const comparisonRow = (page: Page, priceId: string, productId: string) =>
  page
    .getByRole('table', { name: 'Price book comparison' })
    .getByRole('row')
    .filter({ hasText: priceId })
    .filter({ hasText: productId });

test('one upload gives bank deductions, gross margin by product and price book comparison', async ({
  page,
}) => {
  await signIn(page, ...ACCOUNTS.accounting);
  await expect(page).toHaveURL(/\/calculator$/);
  await uploadAndCalculate(page);
  const product = page
    .getByRole('table', { name: 'Gross margin by product' })
    .getByRole('row')
    .filter({ hasText: '4800000100011' });
  await expect(product).toContainText('₱17,385.00');
  await expect(product).toContainText('PL000013, PL000030');
  await expect(comparisonRow(page, 'PL000013', '4800000100011').locator('th, td')).toHaveText([
    'PL000013',
    '4800000100011',
    '24" IPS Monitor FHD 100Hz',
    '2',
    '₱11,590.00',
    '₱5,795.00',
    '₱5,595.00 updated',
    '₱11,190.00',
    '—',
    'Matched',
  ]);
  // Section 06 compares prices only; Variance is not shown.
  const comparison = page.getByRole('table', { name: 'Price book comparison' });
  await expect(comparison.getByRole('columnheader', { name: 'Variance' })).toHaveCount(0);
  await expect(page.locator('.metric').filter({ hasText: 'Variance' })).toHaveCount(0);
  await expect(comparisonRow(page, 'PS000015', '4800000600016')).toContainText(
    'Price ID not found',
  );
  await expect(page.getByRole('table', { name: 'Product rows needing review' })).toContainText(
    'Negative quantity or sales (refund/return) excluded from totals.',
  );
  expect(
    await page.getByRole('table', { name: 'Gross margin by product' }).innerText(),
  ).not.toMatch(/TOTAL:|NOTHING FOLLOWS/);
});

test('price book changes flow to the calculator without recalculating (Admin, kept-alive page)', async ({
  page,
}) => {
  await signIn(page, ...ACCOUNTS.admin);
  await uploadAndCalculate(page);
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  await nav.getByRole('link', { name: 'Price books' }).click();
  await page.getByRole('link', { name: 'Edit PL000030' }).click();
  await page.getByLabel('Promotional price for 4800000100011').fill('4,795.00');
  await page.getByRole('button', { name: 'Save price book' }).click();
  await nav.getByRole('link', { name: 'Price books' }).click();
  await page.getByRole('button', { name: 'Deactivate PL000013' }).click();
  await nav.getByRole('link', { name: 'Bank rate calculator' }).click();
  await expect(comparisonRow(page, 'PL000030', '4800000100011')).toContainText('₱4,795.00');
  await expect(comparisonRow(page, 'PL000013', '4800000100011')).toContainText(
    'Price book inactive',
  );
});

test('Product Team change reaches Accounting after sign-in; sample download works', async ({
  page,
}) => {
  await signIn(page, ...ACCOUNTS.product);
  await page.getByRole('link', { name: 'Edit PL000013' }).click();
  await page.getByLabel('Updated selling price for 4800000100011').fill('5,695.00');
  await page.getByRole('button', { name: 'Save price book' }).click();
  await signOut(page);
  await signIn(page, ...ACCOUNTS.accounting);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download sample Sales Report by Product' }).click();
  expect((await download).suggestedFilename()).toBe('Sample Sales Report by Product.xlsx');
  await uploadAndCalculate(page);
  await expect(comparisonRow(page, 'PL000013', '4800000100011')).toContainText('₱11,390.00');
});

test('product sections fit a phone and clear when inputs change', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, ...ACCOUNTS.accounting);
  await uploadAndCalculate(page);
  await expect(page.getByRole('table', { name: 'Gross margin by product' })).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBeTruthy();
  await page.getByLabel('Search payment methods').fill('BDO STRAIGHT');
  await page.getByLabel('Rate percentage', { exact: true }).fill('3.00');
  await expect(page.getByRole('table', { name: 'Gross margin by product' })).toHaveCount(0);
});

async function createSavedHeadsetPrice(page: Page) {
  await page.getByRole('link', { name: 'New price book' }).click();
  await page.getByLabel('Auto ID').uncheck();
  await page.getByLabel('Price ID', { exact: true }).fill('PS000015');
  await page.getByLabel('Price book name').fill('Saved headset prices');
  await page.getByRole('button', { name: 'Add products', exact: true }).click();
  const dialog = page.getByRole('dialog');
  for (const [label, value] of Object.entries({
    'Product ID': '4800000600016',
    Name: 'Wireless Headset',
    Qty: '1',
    'to Qty': '',
    Unit: 'PCS',
    'Master List Price': '2995',
    'Unit Price': '2795',
    'Disc %': '10.55',
    Discount: '295',
    'Net Price': '2500',
    Cost: '1960',
  }))
    await dialog.getByLabel(label, { exact: true }).fill(value);
  await dialog.getByRole('button', { name: 'Add product', exact: true }).click();
  await page.getByRole('button', { name: 'Save price book' }).click();
  await expect(page.getByRole('status')).toContainText('Price book PS000015 saved.');
}

test('saved price books still calculate after a refresh and Accounting sign-in', async ({
  page,
}) => {
  await signIn(page, ...ACCOUNTS.product);
  await createSavedHeadsetPrice(page);
  await signOut(page);
  await page.reload();
  await signIn(page, ...ACCOUNTS.accounting);
  await uploadAndCalculate(page);
  const row = comparisonRow(page, 'PS000015', '4800000600016');
  await expect(row).toContainText('Matched');
  await expect(row).toContainText('₱5,000.00');
  await expect(row).toContainText('₱2,500.00');
});

test('a browser storage failure keeps the draft and never claims the price was saved', async ({
  page,
}) => {
  await signIn(page, ...ACCOUNTS.product);
  await page.getByRole('link', { name: 'Edit PL000013' }).click();
  await page.getByLabel('Updated selling price for 4800000100011').fill('5695');
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Object.defineProperty(window, '__restorePricingStorage', {
      value: () => {
        Storage.prototype.setItem = original;
      },
    });
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key === 'ledger.pricing.v1') throw new DOMException('Storage full', 'QuotaExceededError');
      original.call(this, key, value);
    };
  });
  await page.getByRole('button', { name: 'Save price book' }).click();
  await expect(page).toHaveURL(/\/price-books\/PL000013\/edit$/);
  await expect(page.getByRole('alert').first()).toContainText('Price books were not saved');
  await expect(page.getByRole('status')).toHaveCount(0);
  await expect(page.getByLabel('Updated selling price for 4800000100011')).toHaveValue('5695');
  await page.evaluate(() =>
    (window as unknown as { __restorePricingStorage: () => void }).__restorePricingStorage(),
  );
  await page.getByRole('button', { name: 'Save price book' }).click();
  await expect(page.getByRole('status')).toContainText('saved');
  await signOut(page);
  await page.reload();
  await signIn(page, ...ACCOUNTS.accounting);
  await uploadAndCalculate(page);
  await expect(comparisonRow(page, 'PL000013', '4800000100011')).toContainText('₱11,390.00');
});

test('unreadable saved data is reported and preserved when a user tries to save', async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem('ledger.pricing.v1', '{broken'));
  await signIn(page, ...ACCOUNTS.product);
  await expect(page.getByRole('alert')).toContainText('Saved price books could not be read');
  await page.getByRole('link', { name: 'Edit PL000013' }).click();
  await page.getByLabel('Updated selling price for 4800000100011').fill('5000');
  await page.getByRole('button', { name: 'Save price book' }).click();
  await expect(page).toHaveURL(/\/price-books\/PL000013\/edit$/);
  expect(await page.evaluate(() => localStorage.getItem('ledger.pricing.v1'))).toBe('{broken');
  await expect(page.getByRole('status')).toHaveCount(0);
});

test('an open Accounting tab receives newly saved Product Team prices', async ({
  page,
  context,
}) => {
  await signIn(page, ...ACCOUNTS.product);
  const accounting = await context.newPage();
  await signIn(accounting, ...ACCOUNTS.accounting);
  await uploadAndCalculate(accounting);
  const row = comparisonRow(accounting, 'PS000015', '4800000600016');
  await expect(row).toContainText('Price ID not found');
  await createSavedHeadsetPrice(page);
  await expect(row).toContainText('Matched');
  await expect(row).toContainText('₱5,000.00');
  await expect(row).toContainText('₱2,500.00');
});

test('Support entered on a PS book shows in the calculator', async ({ page }) => {
  await signIn(page, ...ACCOUNTS.product);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(SAMPLE_PRICE_BOOK_ROWS.map((r) => [...r])),
    'Price Book',
  );
  await page.getByLabel('Import ZenPOS price book files').setInputFiles({
    name: 'Sample ZenPOS Price Book PS000015.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer,
  });
  await expect(page.getByRole('status')).toContainText('PS000015 created: 3 products');
  await page.getByRole('link', { name: 'Edit PS000015' }).click();
  await page.getByLabel('Support for 4800000600016').fill('100');
  await page.getByRole('button', { name: 'Save price book' }).click();
  await expect(page.getByRole('status')).toContainText('saved');
  await signOut(page);
  await signIn(page, ...ACCOUNTS.accounting);
  await uploadAndCalculate(page);
  await expect(page.locator('.metric').filter({ hasText: 'Support to claim' })).toContainText(
    '₱200.00',
  );
  await expect(
    page
      .getByRole('table', { name: 'Gross margin by product' })
      .getByRole('row')
      .filter({ hasText: '4800000600016' }),
  ).toContainText('₱200.00');
  await expect(comparisonRow(page, 'PS000015', '4800000600016')).toContainText('₱200.00');
});

test('Supplier Support from a PS book shows in the calculated report and GrossMargin', async ({
  page,
}) => {
  await signIn(page, ...ACCOUNTS.product);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(SAMPLE_PRICE_BOOK_ROWS.map((r) => [...r])),
    'Price Book',
  );
  await page.getByLabel('Import ZenPOS price book files').setInputFiles({
    name: 'Sample ZenPOS Price Book PS000015.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer,
  });
  await expect(page.getByRole('status')).toContainText('PS000015 created');
  await page.getByRole('link', { name: 'Edit PS000015' }).click();
  await page.getByLabel('Support for 4800000600016').fill('100');
  await page.getByRole('button', { name: 'Save price book' }).click();
  await expect(page.getByRole('status')).toContainText('saved');
  await signOut(page);
  await signIn(page, ...ACCOUNTS.accounting);
  // The demo headset sale is paid in cash; pay it by card so it appears in the calculated report.
  const rows = SAMPLE_EXPORT_ROWS.map((r) =>
    r[0] === '4800000600016' ? r.map((c, i) => (i === 13 ? 'BDO STRAIGHT' : c)) : [...r],
  );
  const sales = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(sales, XLSX.utils.aoa_to_sheet(rows), 'Sales Report by Product');
  await page.getByLabel('Upload Sales Report', { exact: true }).setInputFiles({
    name: 'Sales Report by Product.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: XLSX.write(sales, { type: 'buffer', bookType: 'xlsx' }) as Buffer,
  });
  const calculate = page.getByRole('button', { name: 'Calculate Bank Rate Deductions' });
  await expect(calculate).toBeEnabled();
  await page.getByLabel('Cost basis', { exact: true }).selectOption('unit');
  await calculate.click();
  const table = page.getByRole('table', { name: 'Calculated Sales Report' });
  await expect(table).toBeVisible();
  await expect(table.locator('thead th')).toHaveCount(21);
  await page.getByLabel('Search results').fill('4800000600016');
  const row = table.locator('tbody tr').first();
  await expect(row.locator('td').nth(5)).toHaveText('PS000015');
  await expect(row.locator('td').nth(9)).toHaveText('₱200.00');
  // GrossMargin = ₱5,590.00 − ₱3,920.00 cost − ₱159.32 BDO STRAIGHT charge + ₱200.00 support.
  await expect(row.locator('td').nth(17)).toHaveText('₱1,710.68');
  await expect(row.locator('td').nth(20)).toContainText(
    '+ ₱200.00 supplier support (PS000015: ₱100.00 × 2)',
  );
});
