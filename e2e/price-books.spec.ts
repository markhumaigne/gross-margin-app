import { test, expect, Page } from './fixtures';
import { ACCOUNTS, editNetPrice, navigateInApp, signIn } from './helpers';

/** Adds a product with its own details through Add products (manual entry). */
async function addProduct(page: Page, values: Record<string, string>) {
  await page.getByRole('button', { name: 'Add products', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Add products' });
  for (const [label, value] of Object.entries(values))
    await dialog.getByLabel(label, { exact: true }).fill(value);
  await dialog.getByRole('button', { name: 'Add product', exact: true }).click();
  await expect(dialog).toHaveCount(0);
}

const MONITOR = {
  'Product ID': '4800000100011',
  Name: '24" IPS Monitor FHD 100Hz',
  Unit: 'PCS',
  'Master List Price': '5795',
  'Unit Price': '5795',
  'Disc %': '5.18',
  Discount: '300',
  'Net Price': '5495',
  Cost: '4681',
};

/** A ZenPOS price book export built from the demo sample, with label values overridden. */
async function zenposFile(name: string, labels: Record<string, string> = {}) {
  const XLSX = await import('xlsx');
  const { SAMPLE_PRICE_BOOK_ROWS } =
    await import('../frontend/src/app/mock-data/sample-price-book');
  const rows = SAMPLE_PRICE_BOOK_ROWS.map((r) =>
    typeof r[0] === 'string' && r[0] in labels ? [r[0], labels[r[0]]] : [...r],
  );
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Price Book');
  return {
    name,
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer,
  };
}

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
    await expect(rows.first()).toContainText('PL000034');
  });

  test('duplicate and activate/deactivate', async ({ page }) => {
    await signIn(page, ...ACCOUNTS.product);
    await page.getByRole('button', { name: 'Duplicate PL000013' }).click();
    await expect(page.getByRole('status')).toHaveText(
      'PL000035 created as an inactive copy of PL000013.',
    );
    const copy = page.getByRole('row').filter({ hasText: 'PL000035' });
    await expect(copy).toContainText('Standard Retail 2026 (copy)');
    await expect(copy).toContainText('Inactive');
    await page.getByRole('button', { name: 'Deactivate PL000030' }).click();
    await expect(page.getByRole('row').filter({ hasText: 'PL000030' })).toContainText('Inactive');
    await page.getByRole('button', { name: 'Activate PL000030' }).click();
    await expect(page.getByRole('row').filter({ hasText: 'PL000030' })).toContainText('Active');
  });

  test('delete asks for confirmation and survives a reload', async ({ page }) => {
    await signIn(page, ...ACCOUNTS.product);
    const row = page.getByRole('row').filter({ hasText: 'PL000030' });
    page.once('dialog', (d) => d.dismiss());
    await page.getByRole('button', { name: 'Delete PL000030' }).click();
    await expect(row).toHaveCount(1);
    page.once('dialog', (d) => {
      expect(d.message()).toBe('Delete PL000030 (November Monitor Sale)? This cannot be undone.');
      void d.accept();
    });
    await page.getByRole('button', { name: 'Delete PL000030' }).click();
    await expect(page.getByRole('status')).toHaveText('PL000030 deleted.');
    await expect(row).toHaveCount(0);
    await page.reload();
    await signIn(page, ...ACCOUNTS.product);
    await expect(page.getByRole('table', { name: 'Price books' })).toBeVisible();
    await expect(row).toHaveCount(0);
  });

  test('Admin can manage price books too', async ({ page }) => {
    await signIn(page, ...ACCOUNTS.admin);
    await navigateInApp(page, '/price-books');
    await expect(page.getByRole('button', { name: 'Duplicate PL000030' })).toBeEnabled();
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

test.describe('Price book editor', () => {
  test('Product Team creates a price book with products and their prices', async ({ page }) => {
    await signIn(page, ...ACCOUNTS.product);
    await page.getByRole('link', { name: 'New price book' }).click();
    await page.getByLabel('Price book name').fill('Weekend Flash Sale');
    await page.getByLabel('Effective date').fill('2099-01-01');
    await page.getByLabel('Expiration date').fill('2099-01-31');
    await addProduct(page, { ...MONITOR, 'Net Price': '₱5,495.00' });
    await addProduct(page, {
      'Product ID': '4800000200014',
      Name: 'Wireless Keyboard and Mouse Combo',
      Unit: 'SET',
      'Master List Price': '1495',
      'Unit Price': '1495',
      'Disc %': '33.18',
      Discount: '496',
      'Net Price': '999',
      Cost: '820',
    });
    const table = page.getByRole('table', { name: 'Price book products' });
    const r1 = table.getByRole('row').filter({ hasText: '4800000100011' });
    await expect(r1).toContainText('₱5,795.00');
    await expect(r1).toContainText('5.18%');
    await expect(r1).toContainText('₱5,495.00');
    await expect(r1).toContainText('17.39%');
    await expect(r1).toContainText('Scheduled');
    const r2 = table.getByRole('row').filter({ hasText: '4800000200014' });
    await expect(r2).toContainText('33.18%');
    await expect(r2).toContainText('21.83%');
    await page.getByRole('button', { name: 'Save price book' }).click();
    await expect(page).toHaveURL(/\/price-books\/PL000035$/);
    await expect(page.getByRole('status')).toHaveText('Price book PL000035 saved.');
    await expect(
      page
        .getByRole('table', { name: 'Price book products' })
        .getByRole('row')
        .filter({ hasText: '4800000100011' }),
    ).toContainText('₱5,795.00');
    await page.getByRole('link', { name: 'Back to price books' }).click();
    await expect(page.getByRole('row').filter({ hasText: 'PL000035' })).toContainText(
      'Weekend Flash Sale',
    );
  });

  test('double-clicking Save creates one price book', async ({ page }) => {
    await signIn(page, ...ACCOUNTS.product);
    await page.getByRole('link', { name: 'New price book' }).click();
    await page.getByLabel('Price book name').fill('Double Click Test');
    let posts = 0;
    page.on('request', (r) => {
      if (r.method() === 'POST' && r.url().endsWith('/api/price-books')) posts++;
    });
    await page.route('**/api/price-books', async (route) => {
      if (route.request().method() === 'POST') await new Promise((r) => setTimeout(r, 500));
      await route.continue();
    });
    await page.getByRole('button', { name: 'Save price book' }).dblclick();
    await expect(page.getByRole('status')).toHaveText('Price book PL000035 saved.');
    await page.getByRole('link', { name: 'Back to price books' }).click();
    // Let any second (delayed) request settle before counting.
    await page.waitForTimeout(1500);
    await expect(page.getByRole('row').filter({ hasText: 'Double Click Test' })).toHaveCount(1);
    await expect(page.getByRole('row').filter({ hasText: 'PL000035' })).toHaveCount(1);
    await expect(page.getByRole('row').filter({ hasText: 'PL000036' })).toHaveCount(0);
    expect(posts).toBe(1);
  });

  test('invalid entries are reported and nothing is saved', async ({ page }) => {
    await signIn(page, ...ACCOUNTS.product);
    await page.getByRole('link', { name: 'New price book' }).click();
    await page.getByLabel('Effective date').fill('2099-02-01');
    await page.getByLabel('Expiration date').fill('2099-01-01');
    await addProduct(page, MONITOR);
    await page.getByLabel('Effective start for 4800000100011').fill('2099-01-15');
    await page.getByRole('button', { name: 'Save price book' }).click();
    await expect(page).toHaveURL(/\/price-books\/new$/);
    await expect(page.getByRole('alert')).toContainText(
      'Fix the highlighted fields before saving.',
    );
    for (const m of [
      'Price book name is required.',
      'Expiration date cannot be before the effective date.',
      'Effective start cannot be before the price book effective date.',
    ])
      await expect(page.getByText(m)).toBeVisible();
  });

  test('edit, remove a product, and cancel with confirmation', async ({ page }) => {
    await signIn(page, ...ACCOUNTS.product);
    await page.getByRole('link', { name: 'Edit PL000013' }).click();
    await page.getByLabel('Description / memo').fill('Revised shelf prices');
    await page.getByRole('button', { name: 'Remove 4800000200014' }).click();
    await page.getByRole('button', { name: 'Add products' }).click();
    const dialog = page.getByRole('dialog', { name: 'Add products' });
    await dialog.getByLabel('Product ID', { exact: true }).fill('4800000100011');
    await dialog.getByRole('button', { name: 'Add product', exact: true }).click();
    await expect(dialog.getByText('This Product ID is already in the price book.')).toBeVisible();
    await dialog.getByRole('button', { name: 'Close' }).click();
    await page.getByRole('button', { name: 'Save price book' }).click();
    await expect(page.getByRole('status')).toHaveText('Price book PL000013 saved.');
    await page.getByRole('link', { name: 'Back to price books' }).click();
    const row = page.getByRole('row').filter({ hasText: 'PL000013' });
    await expect(row).toContainText('Revised shelf prices');
    await expect(row.locator('td').nth(3)).toHaveText('1');
    await page.getByRole('link', { name: 'Edit PL000030' }).click();
    await page.getByLabel('Price book name').fill('Changed');
    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page).toHaveURL(/\/price-books\/PL000030$/);
    await expect(
      page.getByRole('heading', { level: 1, name: 'November Monitor Sale' }),
    ).toBeVisible();
  });

  test('search finds products inside a price book', async ({ page }) => {
    await signIn(page, ...ACCOUNTS.product);
    await navigateInApp(page, '/price-books/PL000013');
    const table = page.getByRole('table', { name: 'Price book products' });
    const rows = table.locator('tbody tr[data-product]');
    const search = page.getByLabel('Search products');
    await expect(rows).toHaveCount(2);
    await search.fill('keyboard combo');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toHaveAttribute('data-product', '4800000200014');
    await expect(page.getByText('Showing 1 of 2 products')).toBeVisible();
    await search.fill('4800000100');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('24" IPS Monitor FHD 100Hz');
    await search.fill('tablet');
    await expect(rows).toHaveCount(0);
    await expect(table).toContainText('No products match “tablet”.');
    await search.fill('');
    await expect(rows).toHaveCount(2);
    await expect(page.getByText(/Showing \d+ of/)).toHaveCount(0);

    // While editing, a product added that doesn't match the search clears it so it stays in view.
    await page.getByRole('link', { name: 'Edit', exact: true }).click();
    await page.getByLabel('Search products').fill('monitor');
    await expect(rows).toHaveCount(1);
    await addProduct(page, {
      'Product ID': '4800000400010',
      Name: 'USB-C Docking Station 8-in-1',
      Unit: 'PCS',
      'Master List Price': '4950',
      'Unit Price': '4950',
      'Net Price': '4950',
      Cost: '4000',
    });
    await expect(page.getByLabel('Search products')).toHaveValue('');
    await expect(rows).toHaveCount(3);
  });

  test('Accounting Head cannot reach the editor', async ({ page }) => {
    await signIn(page, ...ACCOUNTS.accounting);
    for (const url of ['/price-books/new', '/price-books/PL000013/edit']) {
      await navigateInApp(page, url);
      await expect(page).toHaveURL(/\/forbidden$/);
    }
  });

  test('editor shows unit, cost and margin for the price being set', async ({ page }) => {
    await signIn(page, ...ACCOUNTS.product);
    await page.getByRole('link', { name: 'Edit PL000013' }).click();
    await addProduct(page, {
      'Product ID': '4800000400010',
      Name: 'USB-C Docking Station 8-in-1',
      Unit: 'PCS',
      'Master List Price': '4950',
      'Unit Price': '4950',
      'Net Price': '4950',
      Cost: '4952',
    });
    const row = page
      .getByRole('table', { name: 'Price book products' })
      .getByRole('row')
      .filter({ hasText: '4800000400010' });
    await expect(row).toContainText('PCS');
    await expect(row).toContainText('₱4,952.00');
    await expect(row).toContainText('-0.04%');
    await editNetPrice(page, '4800000400010', '4000');
    await expect(row).toContainText('-19.22%');
  });
});

test.describe('Price IDs and ZenPOS import', () => {
  test('manual Price ID mirrors a POS price list and is validated', async ({ page }) => {
    await signIn(page, ...ACCOUNTS.product);
    await page.getByRole('link', { name: 'New price book' }).click();
    await expect(page.getByLabel('Price ID', { exact: true })).toBeDisabled();
    await page.getByLabel('Auto ID').uncheck();
    await page.getByLabel('Price book name').fill('Headset Promo');
    await page.getByLabel('Price ID', { exact: true }).fill('pl000013');
    await page.getByRole('button', { name: 'Save price book' }).click();
    await expect(page.getByText('Price ID PL000013 is already used.')).toBeVisible();
    await page.getByLabel('Price ID', { exact: true }).fill('PX12');
    await expect(
      page.getByText('Price ID must be PL, PS or PI followed by 6 digits (e.g. PL000123).'),
    ).toBeVisible();
    await page.getByLabel('Price ID', { exact: true }).fill('ps000015');
    await page.getByRole('button', { name: 'Save price book' }).click();
    await expect(page).toHaveURL(/\/price-books\/PS000015$/);
  });

  test('Product Team imports ZenPOS price book exports', async ({ page }) => {
    await signIn(page, ...ACCOUNTS.product);
    const input = page.getByLabel('Import ZenPOS price book files');
    await input.setInputFiles([
      await zenposFile('sample.xlsx'),
      await zenposFile('internal.xlsx', {
        'Price ID:': 'PI000004',
        'Name:': 'Demo Internal Promo',
      }),
    ]);
    await expect(page.getByRole('status')).toContainText('PS000015 created: 3 products');
    await expect(page.getByRole('status')).toContainText('PI000004 created: 3 products');
    await page.reload();
    await signIn(page, ...ACCOUNTS.product);
    await expect(page.getByRole('row').filter({ hasText: 'PS000015' })).toContainText(
      'Demo Headset Promo',
    );
    await page.getByRole('link', { name: 'View PS000015' }).click();
    await expect(page.getByRole('table', { name: 'Price book products' })).toContainText(
      '0480000060003',
    );
    await navigateInApp(page, '/price-books');
    await page
      .getByLabel('Import ZenPOS price book files')
      .setInputFiles(await zenposFile('sample.xlsx'));
    await expect(page.getByRole('status')).toContainText(
      'PS000015 updated: 0 added, 0 removed, 0 prices changed, Support kept on 0',
    );
  });

  test('a file that is not a ZenPOS price book is reported and others still import', async ({
    page,
  }) => {
    await signIn(page, ...ACCOUNTS.product);
    await page
      .getByLabel('Import ZenPOS price book files')
      .setInputFiles([
        { name: 'notes.csv', mimeType: 'text/csv', buffer: Buffer.from('Name,Qty\r\nx,1') },
        await zenposFile('sample.xlsx'),
      ]);
    await expect(page.getByRole('alert')).toContainText(
      'notes.csv: This file is not a ZenPOS price book export',
    );
    await expect(page.getByRole('status')).toContainText('PS000015 created');
  });
});
