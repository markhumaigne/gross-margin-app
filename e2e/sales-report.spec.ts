import { test, expect } from '@playwright/test';
import { ACCOUNTS, navigateInApp, signIn } from './helpers';

const csv = (text: string, name = 'sales.csv') => ({
  name,
  mimeType: 'text/csv',
  buffer: Buffer.from(text),
});

test('Accounting Head uploads a CSV and sees gross margin per product', async ({ page }) => {
  await signIn(page, ...ACCOUNTS.accounting);
  await expect(
    page.getByText(
      'Demonstration data — calculations use mock products and costs and are not financial records.',
    ),
  ).toBeVisible();
  await page
    .getByLabel('Upload sales report file')
    .setInputFiles(
      csv(
        'SKU,Item,Qty,Net Total,Unit Cost\r\n4800000100011,Monitor,1,"5,795.00",4681\r\n4800000100011,Monitor,2,11000,4681\r\n4800009999999,Unknown,1,100,50\r\n4800000200014,Combo,-1,-1295,820\r\n',
      ),
    );
  await expect(page.getByRole('table', { name: 'Upload preview' }).locator('tbody tr')).toHaveCount(
    4,
  );
  const row = page
    .getByRole('table', { name: 'Sales by product' })
    .getByRole('row')
    .filter({ hasText: '4800000100011' });
  await expect(row.locator('td')).toHaveText([
    '4800000100011',
    '24" IPS Monitor FHD 100Hz',
    '3',
    '₱16,795.00',
    '₱14,043.00',
    '₱2,752.00',
    '16.39%',
    'Report cost',
  ]);
  const review = page.getByRole('table', { name: 'Rows needing review' });
  await expect(review).toContainText('Product ID not found in the mock product catalog.');
  await expect(review).toContainText(
    'Negative quantity or sales (refund/return) excluded from totals.',
  );
});

test('missing cost stays blank until the estimate is explicitly enabled', async ({ page }) => {
  await signIn(page, ...ACCOUNTS.accounting);
  await page
    .getByLabel('Upload sales report file')
    .setInputFiles(csv('Product ID,Qty,Net Sales\r\n4800000200014,2,2590\r\n'));
  const row = page
    .getByRole('table', { name: 'Sales by product' })
    .getByRole('row')
    .filter({ hasText: '4800000200014' });
  await expect(row).toContainText('Missing cost');
  await expect(row.locator('td').nth(4)).toHaveText('—');
  await page.getByLabel('Use current mock cost as an estimate when cost is missing').check();
  await expect(row).toContainText('Estimate (current mock cost)');
  await expect(row.locator('td').nth(4)).toHaveText('₱1,640.00');
  await expect(row.locator('td').nth(6)).toHaveText('36.68%');
});

test('unsupported files are rejected; demo report loads; admin has access', async ({ page }) => {
  await signIn(page, ...ACCOUNTS.admin);
  await navigateInApp(page, '/sales-report');
  await page.getByLabel('Upload sales report file').setInputFiles(csv('hello', 'notes.txt'));
  await expect(page.getByRole('alert')).toHaveText('Upload a .csv, .xlsx or .xls file.');
  await page.getByRole('button', { name: 'Load demo report' }).click();
  await expect(page.getByRole('table', { name: 'Sales by product' })).toBeVisible();
  await expect(
    page.getByRole('table', { name: 'Rows needing review' }).locator('tbody tr'),
  ).toHaveCount(3);
});

test('manual column mapping recovers an unrecognised header; page fits a phone', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, ...ACCOUNTS.accounting);
  await page
    .getByLabel('Upload sales report file')
    .setInputFiles(csv('Product ID,Qty,Final Value\r\n4800000200014,1,1295\r\n'));
  await expect(
    page.getByText('Map the required columns (Product ID, Quantity, Net sales) to see results.'),
  ).toBeVisible();
  await page.getByLabel('Net sales column').selectOption({ label: 'Final Value' });
  await expect(page.getByRole('table', { name: 'Sales by product' })).toContainText('₱1,295.00');
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBeTruthy();
});
