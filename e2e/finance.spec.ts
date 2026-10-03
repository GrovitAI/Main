import { expect, test, type Page } from '@playwright/test';
import { hasSavedLogin } from '../playwright.config';

/**
 * Finance, as the signed-in owner, against the staging database.
 *
 * The one entry it records is an expense named "E2E <stamp> …"; it stays in
 * the staging ledger (entries are never hard-deleted) and is easy to spot.
 */
test.skip(!hasSavedLogin, 'Run `npm run e2e:login` once to save a signed-in session.');

const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
const particulars = `E2E ${stamp} test expense`;

async function openFinance(page: Page, tab: 'Overview' | 'Ledger' | 'Cash Book' | 'Day Close' | 'Catalog'): Promise<void> {
  await page.goto('/finance');
  const tabButton = page.getByRole('tab', { name: tab }).or(page.getByText(tab, { exact: true }));
  await expect(tabButton.first()).toBeVisible({ timeout: 60_000 });
  await tabButton.first().click();
}

test.describe.serial('finance', () => {
  test('every tab opens without an error state', async ({ page }) => {
    for (const tab of ['Overview', 'Ledger', 'Cash Book', 'Day Close', 'Catalog'] as const) {
      await openFinance(page, tab);
      await expect(page.getByText(/something went wrong/i)).toHaveCount(0);
      await expect(page.getByText(/unable to load/i)).toHaveCount(0);
    }
  });

  test('an expense recorded in the ledger appears in the ledger', async ({ page }) => {
    await openFinance(page, 'Ledger');
    await page.getByLabel('Record an entry').click();

    await page.getByText('Expense', { exact: true }).first().click();
    await page.getByText('Cash', { exact: true }).first().click();
    await page.getByLabel('Amount').fill('123.45');
    await page.getByLabel('Particulars').fill(particulars);
    await page.getByLabel('Counterparty').fill('E2E vendor');
    await page.getByRole('button', { name: 'Save entry' }).click();

    await expect(page.getByRole('button', { name: 'Save entry' })).toHaveCount(0);
    await expect(page.getByText(particulars)).toBeVisible();
  });

  test('the overview and the cash book read the same ledger', async ({ page }) => {
    await openFinance(page, 'Cash Book');
    await expect(page.getByText(particulars)).toBeVisible();
    await openFinance(page, 'Overview');
    await expect(page.getByText(/something went wrong/i)).toHaveCount(0);
  });
});
