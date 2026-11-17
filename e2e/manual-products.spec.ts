import { test, expect, Locator } from '@playwright/test';
import { ACCOUNTS, signIn } from './helpers';

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
    Margin: '-5.56',
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
    '-5.56%',
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
