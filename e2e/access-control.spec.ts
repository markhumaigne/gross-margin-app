import { test, expect } from '@playwright/test';
import { ACCOUNTS, navigateInApp, navLinks, signIn, signOut } from './helpers';

test('unauthenticated deep link goes to sign-in and returns after login', async ({ page }) => {
  await page.goto('/users');
  await expect(page).toHaveURL(/\/login\?returnUrl=%2Fusers$/);
  await page.getByLabel('Username').fill('admin');
  await page.getByLabel('Password').fill('Admin123!');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/users$/);
});

test('sign-in errors', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toHaveText('Enter your username and password.');
  await page.getByLabel('Username').fill('admin');
  await page.getByLabel('Password').fill('wrong');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toHaveText('Invalid username or password.');
});

test('Admin sees every module', async ({ page }) => {
  await signIn(page, ...ACCOUNTS.admin);
  await expect(page).toHaveURL(/\/calculator$/);
  await expect(
    page.getByRole('heading', { name: 'Bank rate deduction calculator', exact: true }),
  ).toBeVisible();
  expect(await navLinks(page)).toEqual(['Bank rate calculator', 'Price books', 'User accounts']);
  for (const [url, heading] of [
    ['/price-books', 'Price books'],
    ['/users', 'User accounts'],
  ]) {
    await navigateInApp(page, url);
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
  }
});

test('calculator step links stay in the signed-in session', async ({ page }) => {
  await signIn(page, ...ACCOUNTS.admin);
  await page.getByRole('link', { name: /Review rates/ }).click();
  await expect(page).toHaveURL(/\/calculator#configuration$/);
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
});

test('Accounting Head cannot open Price Books or accounts', async ({ page }) => {
  await signIn(page, ...ACCOUNTS.accounting);
  await expect(page).toHaveURL(/\/calculator$/);
  expect(await navLinks(page)).toEqual(['Bank rate calculator']);
  await navigateInApp(page, '/sales-report');
  await expect(page).toHaveURL(/\/calculator$/);
  for (const url of ['/price-books', '/users']) {
    await navigateInApp(page, url);
    await expect(page).toHaveURL(/\/forbidden$/);
    await expect(
      page.getByText('Your role (Accounting Head) cannot open this page.'),
    ).toBeVisible();
  }
});

test('Product Team cannot open accounting reports or accounts', async ({ page }) => {
  await signIn(page, ...ACCOUNTS.product);
  await expect(page).toHaveURL(/\/price-books$/);
  expect(await navLinks(page)).toEqual(['Price books']);
  for (const url of ['/calculator', '/sales-report', '/users']) {
    await navigateInApp(page, url);
    await expect(page).toHaveURL(/\/forbidden$/);
  }
});

test('a returnUrl the new user cannot open falls back to their home', async ({ page }) => {
  await page.goto('/login?returnUrl=%2Fsales-report');
  await page.getByLabel('Username').fill('productteam');
  await page.getByLabel('Password').fill('Product123!');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/price-books$/);
});

test('sign out protects routes again; shell fits a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, ...ACCOUNTS.admin);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBeTruthy();
  await signOut(page);
  await expect(page).toHaveURL(/\/login/);
  await navigateInApp(page, '/calculator');
  await expect(page).toHaveURL(/\/login\?returnUrl=%2Fcalculator$/);
});

test('calculator keeps its state between pages until sign-out', async ({ page }) => {
  await signIn(page, ...ACCOUNTS.admin);
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  await page.getByLabel('Search payment methods').fill('BDO PAY/CASA');
  await page.getByLabel('Rate percentage', { exact: true }).fill('4.00');
  await nav.getByRole('link', { name: 'Price books' }).click();
  await nav.getByRole('link', { name: 'Bank rate calculator' }).click();
  await expect(page.getByLabel('Rate percentage', { exact: true })).toHaveValue('4.00');
  await signOut(page);
  await signIn(page, ...ACCOUNTS.admin);
  await page.getByLabel('Search payment methods').fill('BDO PAY/CASA');
  await expect(page.getByLabel('Rate percentage', { exact: true })).not.toHaveValue('4.00');
});
