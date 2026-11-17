import { test, expect } from '@playwright/test';
import { ACCOUNTS, navigateInApp, signIn } from './helpers';

test.describe('Price book list', () => {
  test('search, filter and record count', async ({ page }) => {
    await signIn(page, ...ACCOUNTS.product);
    const rows = page.getByRole('table', { name: 'Price books' }).locator('tbody tr');
    await expect(rows).toHaveCount(3);
    await page.getByLabel('Search price books').fill('holiday');
    await expect(rows).toHaveCount(1);
    await expect(page.getByText('1 record(s)')).toBeVisible();
    await page.getByLabel('Search price books').fill('');
    await page.getByLabel('Status filter').selectOption({ label: 'Inactive' });
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('PB-0003');
  });

  test('duplicate and activate/deactivate', async ({ page }) => {
    await signIn(page, ...ACCOUNTS.product);
    await page.getByRole('button', { name: 'Duplicate PB-0001' }).click();
    await expect(page.getByRole('status')).toHaveText(
      'PB-0004 created as an inactive copy of PB-0001.',
    );
    const copy = page.getByRole('row').filter({ hasText: 'PB-0004' });
    await expect(copy).toContainText('Standard Retail 2026 (copy)');
    await expect(copy).toContainText('Inactive');
    await page.getByRole('button', { name: 'Deactivate PB-0002' }).click();
    await expect(page.getByRole('row').filter({ hasText: 'PB-0002' })).toContainText('Inactive');
    await page.getByRole('button', { name: 'Activate PB-0002' }).click();
    await expect(page.getByRole('row').filter({ hasText: 'PB-0002' })).toContainText('Active');
  });

  test('Admin can manage price books too', async ({ page }) => {
    await signIn(page, ...ACCOUNTS.admin);
    await navigateInApp(page, '/price-books');
    await expect(page.getByRole('button', { name: 'Duplicate PB-0002' })).toBeEnabled();
  });

  test('price book list fits a phone without page scroll', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page, ...ACCOUNTS.product);
    await expect(page.getByRole('table', { name: 'Price books' })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBeTruthy();
  });
});
