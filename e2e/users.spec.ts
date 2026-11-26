import { test, expect } from './fixtures';
import { ACCOUNTS, navigateInApp, signIn, signOut } from './helpers';

test('Admin transfers the Accounting Head role; exactly one holder remains', async ({ page }) => {
  await signIn(page, ...ACCOUNTS.admin);
  await navigateInApp(page, '/users');
  await page
    .getByLabel('New Accounting Head')
    .selectOption({ label: 'Demo Product Lead (productteam)' });
  await page
    .getByLabel('Role for previous Accounting Head')
    .selectOption({ label: 'Product Team' });
  await page.getByRole('button', { name: 'Transfer role' }).click();
  await expect(page.getByRole('status')).toHaveText(
    'Demo Product Lead is now the Accounting Head. Demo Accountant is now Product Team.',
  );
  const table = page.getByRole('table', { name: 'User accounts' });
  await expect(table.getByText('Accounting Head', { exact: true })).toHaveCount(1);
  await expect(page.getByLabel('Role for accounting')).toHaveValue('product-team');
  await signOut(page);
  await signIn(page, ...ACCOUNTS.product);
  await expect(page).toHaveURL(/\/calculator$/);
  await signOut(page);
  await signIn(page, ...ACCOUNTS.accounting);
  await expect(page).toHaveURL(/\/price-books$/);
});

test('Accounting Head cannot be assigned through the role select', async ({ page }) => {
  await signIn(page);
  await navigateInApp(page, '/users');
  await expect(page.getByLabel('Role for productteam').locator('option')).toHaveText([
    'Admin',
    'Product Team',
  ]);
  await expect(page.getByLabel('Role for accounting')).toHaveCount(0);
});

test('Admin adds an account that can sign in', async ({ page }) => {
  await signIn(page);
  await navigateInApp(page, '/users');
  await page.getByLabel('New username').fill('pricing.lead');
  await page.getByLabel('Display name').fill('Pricing Lead');
  await page.getByLabel('Password', { exact: true }).fill('Password1');
  await page.getByLabel('New account role').selectOption({ label: 'Product Team' });
  await page.getByRole('button', { name: 'Add account' }).click();
  await expect(page.getByRole('status')).toHaveText('Account pricing.lead added.');
  await signOut(page);
  await signIn(page, 'pricing.lead', 'Password1');
  await expect(page).toHaveURL(/\/price-books$/);
});

test('double-clicking Add account creates one account', async ({ page }) => {
  await signIn(page);
  await navigateInApp(page, '/users');
  await page.getByLabel('New username').fill('double.click');
  await page.getByLabel('Display name').fill('Double Click');
  await page.getByLabel('Password', { exact: true }).fill('Password1');
  let posts = 0;
  page.on('request', (r) => {
    if (r.method() === 'POST' && r.url().endsWith('/api/users')) posts++;
  });
  await page.route('**/api/users', async (route) => {
    if (route.request().method() === 'POST') await new Promise((r) => setTimeout(r, 500));
    await route.continue();
  });
  await page.getByRole('button', { name: 'Add account' }).dblclick();
  await expect(page.getByRole('status')).toHaveText('Account double.click added.');
  await page.waitForTimeout(1500);
  expect(posts).toBe(1);
});

test('self-deactivation is refused; deactivated accounts cannot sign in', async ({ page }) => {
  await signIn(page);
  await navigateInApp(page, '/users');
  await page.getByRole('button', { name: 'Deactivate admin' }).click();
  await expect(page.getByRole('alert')).toHaveText(/You cannot deactivate your own account\./);
  await page.getByRole('button', { name: 'Deactivate productteam' }).click();
  await expect(page.getByRole('status')).toHaveText('productteam deactivated.');
  await signOut(page);
  await page.getByLabel('Username').fill('productteam');
  await page.getByLabel('Password').fill('Product123!');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toHaveText('This account is inactive. Contact an Admin.');
});

test('a failed role change keeps the stored role', async ({ page }) => {
  await signIn(page);
  await navigateInApp(page, '/users');
  await page.getByLabel('Role for admin').selectOption({ label: 'Product Team' });
  await expect(page.getByRole('alert')).toHaveText(/You cannot remove your own Admin role\./);
  await expect(page.getByLabel('Role for admin')).toHaveValue('admin');
});

test('a deactivated user is signed out on their next request', async ({ browser }) => {
  const context = await browser.newContext();
  try {
    const pageA = await context.newPage();
    await signIn(pageA, ...ACCOUNTS.product);
    await expect(pageA).toHaveURL(/\/price-books$/);
    const pageB = await context.newPage();
    await signIn(pageB);
    await navigateInApp(pageB, '/users');
    await pageB.getByRole('button', { name: 'Deactivate productteam' }).click();
    await expect(pageB.getByRole('status')).toHaveText('productteam deactivated.');
    await pageA.getByRole('link', { name: 'Price books' }).click();
    await expect(pageA).toHaveURL(/\/login/);
  } finally {
    await context.close();
  }
});
