import { expect, Page } from '@playwright/test';

/** Hardcoded development accounts (mock authentication only). */
export const ACCOUNTS = {
  admin: ['admin', 'Admin123!'],
  accounting: ['accounting', 'Accounting123!'],
  product: ['productteam', 'Product123!'],
} as const;

export async function signIn(page: Page, username = 'admin', password = 'Admin123!') {
  // Reuse the sign-in page after signOut: account changes are still held in memory.
  if (!/\/login(\?|$)/.test(page.url())) await page.goto('/login');
  await page.getByLabel('Username', { exact: true }).fill(username);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

/**
 * Navigates without reloading the page. A full page.goto would reset the in-memory session and
 * account changes and uploaded reports, so this lets the Angular router handle it (guards included).
 */
export async function navigateInApp(page: Page, url: string) {
  await page.evaluate((target) => {
    history.pushState(null, '', target);
    window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
  }, url);
}

export async function signOut(page: Page) {
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login/);
}

/** In the price book editor: opens Edit product for a row and changes its Net Price (unsaved). */
export async function editNetPrice(page: Page, productId: string, netPrice: string) {
  await page.getByRole('button', { name: `Edit product ${productId}`, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit product' });
  await dialog.getByLabel('Net Price', { exact: true }).fill(netPrice);
  await dialog.getByRole('button', { name: 'Save product', exact: true }).click();
  await expect(dialog).toHaveCount(0);
}

/** Top-level module links in the sidebar (calculator sub-links excluded). */
export async function navLinks(page: Page): Promise<string[]> {
  const links = page.locator('nav[aria-label="Main navigation"] > a');
  await expect(links.first()).toBeVisible();
  return (await links.allTextContents()).map((t) => t.replace(/^\W+/, '').trim());
}
