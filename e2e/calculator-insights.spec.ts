import { test, expect, Page } from '@playwright/test';
import * as XLSX from 'xlsx';
import { SAMPLE_EXPORT_ROWS } from '../frontend/src/app/mock-data/sample-export';
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
    '₱400.00',
    'Matched',
  ]);
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
  await expect(comparisonRow(page, 'PL000030', '4800000100011')).toContainText('₱1,000.00');
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
  await expect(comparisonRow(page, 'PL000013', '4800000100011')).toContainText('₱200.00');
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
