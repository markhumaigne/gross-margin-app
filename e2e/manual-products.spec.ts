import { test, expect, Locator } from './fixtures';
import { ACCOUNTS, navigateInApp, signIn } from './helpers';

async function fillProduct(dialog: Locator, id = '001-CUSTOM') {
  for (const [label, value] of Object.entries({
    'Product ID': id,
    Name: 'Manual monitor',
    Qty: '1.5',
    'to Qty': '10',
    Unit: 'BOX',
    'Master List Price': '1200',
    'Unit Price': '1000',
    'Disc %': '10',
    Discount: '100',
    'Net Price': '900',
    Cost: '950',
  }))
    await dialog.getByLabel(label, { exact: true }).fill(value);
}

test('manual products retain all fields through save, edit, duplicate, and removal', async ({
  page,
}) => {
  await signIn(page, ...ACCOUNTS.product);
  await page.getByRole('link', { name: 'New price book' }).click();
  await page.getByLabel('Price book name').fill('Manual prices');
  await page.getByRole('button', { name: 'Add products', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await fillProduct(dialog);
  await dialog.getByRole('button', { name: 'Add product', exact: true }).click();
  const row = page
    .getByRole('table', { name: 'Price book products' })
    .getByRole('row')
    .filter({ hasText: '001-CUSTOM' });
  await expect(row).toContainText('Manual monitor');
  await page.getByRole('button', { name: 'Save price book' }).click();
  await expect(page.getByRole('status')).toContainText('saved');
  await expect(row.locator('td').nth(2)).toHaveText('1.5');
  await expect(row.locator('td').nth(3)).toHaveText('10');
  for (const value of [
    'BOX',
    '₱1,200.00',
    '₱1,000.00',
    '10.00%',
    '₱100.00',
    '₱900.00',
    '₱950.00',
    '-5.26%',
  ])
    await expect(row).toContainText(value);
  await page.getByRole('link', { name: 'Edit', exact: true }).click();
  await page.getByRole('button', { name: 'Edit product 001-CUSTOM', exact: true }).click();
  await expect(dialog.getByLabel('Product ID', { exact: true })).toHaveValue('001-CUSTOM');
  await expect(dialog.getByLabel('Net Price', { exact: true })).toHaveValue('900.00');
  await dialog.getByLabel('Name', { exact: true }).fill('Canceled edit');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(row).toContainText('Manual monitor');
  await page.getByRole('button', { name: 'Edit product 001-CUSTOM', exact: true }).click();
  await dialog.getByLabel('Name', { exact: true }).fill('Updated monitor');
  await dialog.getByLabel('Net Price', { exact: true }).fill('875');
  await dialog.getByRole('button', { name: 'Save product', exact: true }).click();
  await page.getByRole('button', { name: 'Save price book' }).click();
  await expect(row).toContainText('Updated monitor');
  await expect(row).toContainText('₱875.00');
  await page.getByRole('button', { name: 'Duplicate', exact: true }).click();
  await expect(row).toContainText('Updated monitor');
  await page.getByRole('link', { name: 'Edit', exact: true }).click();
  await page.getByRole('button', { name: 'Remove 001-CUSTOM', exact: true }).click();
  await page.getByRole('button', { name: 'Save price book' }).click();
  await expect(page.getByRole('heading', { name: 'Products (0)' })).toBeVisible();
});

test('manual form validates required fields, numeric values, ranges, and duplicate IDs', async ({
  page,
}) => {
  await signIn(page, ...ACCOUNTS.product);
  await page.getByRole('link', { name: 'New price book' }).click();
  await page.getByRole('button', { name: 'Add products', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Add product', exact: true }).click();
  await expect(dialog.getByText('Product ID is required.')).toBeVisible();
  await fillProduct(dialog);
  await dialog.getByLabel('to Qty', { exact: true }).fill('1');
  await dialog.getByLabel('Net Price', { exact: true }).fill('abc');
  await dialog.getByRole('button', { name: 'Add product', exact: true }).click();
  await expect(dialog.getByLabel('to Qty', { exact: true })).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  await expect(dialog.getByLabel('Net Price', { exact: true })).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  await fillProduct(dialog);
  await dialog.getByRole('button', { name: 'Add product', exact: true }).click();
  await page.getByRole('button', { name: 'Add products', exact: true }).click();
  await fillProduct(dialog, ' 001-custom ');
  await dialog.getByRole('button', { name: 'Add product', exact: true }).click();
  await expect(dialog.getByText('This Product ID is already in the price book.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Products (1)' })).toBeVisible();
});

test('manual dialog fits a phone and can be completed with scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, ...ACCOUNTS.product);
  await page.getByRole('link', { name: 'New price book' }).click();
  await page.getByRole('button', { name: 'Add products', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await fillProduct(dialog);
  expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBeTruthy();
  await dialog.getByRole('button', { name: 'Add product', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Products (1)' })).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBeTruthy();
});

test('manual product IDs are treated as literal identifiers', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await signIn(page, ...ACCOUNTS.product);
  await page.getByRole('link', { name: 'New price book' }).click();
  await page.getByLabel('Price book name').fill('Literal product IDs');
  for (const id of ['constructor', '__proto__']) {
    await page.getByRole('button', { name: 'Add products', exact: true }).click();
    await fillProduct(page.getByRole('dialog'), id);
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Add product', exact: true })
      .click();
  }
  await page.getByRole('button', { name: 'Save price book' }).click();
  await expect(page.getByRole('status')).toContainText('saved');
  expect(errors).toEqual([]);
});

test('PM enters Support on a PS book and sees margin after support', async ({ page }) => {
  await signIn(page, ...ACCOUNTS.product);
  await page.getByRole('link', { name: 'New price book' }).click();
  await page.getByLabel('Auto ID').uncheck();
  await page.getByLabel('Price ID', { exact: true }).fill('PS000077');
  await page.getByLabel('Price book name').fill('Support test');
  await page.getByRole('button', { name: 'Add products', exact: true }).click();
  const dialog = page.getByRole('dialog');
  for (const [label, value] of Object.entries({
    'Product ID': 'SUP-1',
    Name: 'Promo headset',
    Qty: '0',
    'to Qty': '99999',
    Unit: 'PCS',
    'Master List Price': '12999',
    'Unit Price': '11999',
    'Disc %': '0',
    Discount: '0',
    'Net Price': '11999',
    Cost: '12749.25',
    Support: '1500',
  }))
    await dialog.getByLabel(label, { exact: true }).fill(value);
  await expect(dialog.getByLabel('Support type', { exact: true })).toHaveCount(0);
  await expect(dialog.getByText('Margin on cost')).toHaveCount(0);
  await expect(dialog.getByText('Margin after support')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Add product', exact: true }).click();
  const row = page
    .getByRole('table', { name: 'Price book products' })
    .getByRole('row')
    .filter({ hasText: 'SUP-1' });
  await expect(row).toContainText('-5.88%');
  await expect(row).toContainText('6.66%');
  await page.getByRole('button', { name: 'Save price book' }).click();
  await expect(page.getByRole('status')).toContainText('saved');
  await expect(row).toContainText('₱1,500.00');
  await expect(row).toContainText('6.66%');
  await page.getByRole('link', { name: 'Edit', exact: true }).click();
  await expect(page.getByLabel('Support type for SUP-1')).toHaveCount(0);
  await page.getByLabel('Support for SUP-1').fill('1000');
  await expect(row).toContainText('2.13%');
  await page.getByRole('button', { name: 'Save price book' }).click();
  await expect(page.getByRole('status')).toContainText('saved');
  await expect(row).toContainText('₱1,000.00');
  await navigateInApp(page, '/price-books/PL000013');
  await expect(page.getByRole('table', { name: 'Price book products' })).toBeVisible();
  await expect(
    page
      .getByRole('table', { name: 'Price book products' })
      .getByRole('columnheader', { name: 'Support', exact: true }),
  ).toHaveCount(0);
});

test('clicking a product while viewing opens it in edit mode', async ({ page }) => {
  await signIn(page, ...ACCOUNTS.product);
  await page.getByRole('link', { name: 'View PL000013' }).click();
  const products = page.getByRole('table', { name: 'Price book products' });
  await products.getByRole('row').filter({ hasText: '4800000100011' }).click();
  await expect(page).toHaveURL(/\/price-books\/PL000013\/edit$/);
  const dialog = page.getByRole('dialog', { name: 'Edit product' });
  await expect(dialog.getByLabel('Product ID', { exact: true })).toHaveValue('4800000100011');
  await dialog.getByLabel('Net Price', { exact: true }).fill('5,000.00');
  await dialog.getByRole('button', { name: 'Save product', exact: true }).click();
  await expect(products.getByRole('row').filter({ hasText: '4800000100011' })).toContainText(
    '₱5,000.00',
  );
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page).toHaveURL(/\/price-books\/PL000013$/);
  await expect(products.getByRole('row').filter({ hasText: '4800000100011' })).toContainText(
    '₱5,595.00',
  );
});

test('the side Edit changes every field of an imported product', async ({ page }) => {
  await signIn(page, ...ACCOUNTS.product);
  const XLSX = await import('xlsx');
  const { SAMPLE_PRICE_BOOK_ROWS } =
    await import('../frontend/src/app/mock-data/sample-price-book');
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(SAMPLE_PRICE_BOOK_ROWS.map((r) => [...r])),
    'Price Book',
  );
  await page.getByLabel('Import ZenPOS price book files').setInputFiles({
    name: 'sample.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer,
  });
  await expect(page.getByRole('status')).toContainText('PS000015 created');
  await page.getByRole('link', { name: 'View PS000015' }).click();
  const row = page
    .getByRole('table', { name: 'Price book products' })
    .getByRole('row')
    .filter({ hasText: '4800000600016' });
  await row.click();
  await expect(page).toHaveURL(/\/price-books\/PS000015\/edit$/);
  const dialog = page.getByRole('dialog', { name: 'Edit product' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Product ID', { exact: true })).toHaveValue('4800000600016');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await row.getByLabel('Support for 4800000600016').click();
  await expect(dialog).toHaveCount(0);
  await row.getByText('Wireless Headset with Microphone').click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Effective start', { exact: true })).toHaveValue('2026-11-01');
  await dialog.getByLabel('Net Price', { exact: true }).fill('2500');
  await dialog.getByLabel('Support', { exact: true }).fill('100');
  await dialog.getByLabel('Effective end', { exact: true }).fill('2026-11-20');
  await dialog.getByLabel('Memo', { exact: true }).fill('Sony claim');
  await dialog.getByRole('button', { name: 'Save product', exact: true }).click();
  await page.getByRole('button', { name: 'Save price book' }).click();
  await expect(page.getByRole('status')).toContainText('saved');
  for (const text of ['₱2,500.00', '₱100.00', 'Nov 20, 2026', 'Sony claim'])
    await expect(row).toContainText(text);
});
