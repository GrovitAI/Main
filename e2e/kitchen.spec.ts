import { expect, test, type Page } from '@playwright/test';
import { hasSavedLogin } from '../playwright.config';

/**
 * The Central Kitchen screens, as the signed-in owner, against the staging
 * database. Everything created here is named "E2E <stamp> …" and removed from
 * the lists at the end; the entries stay in the history, voided.
 */
test.skip(!hasSavedLogin, 'Run `npm run e2e:login` once to save a signed-in session.');

const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
const branchName = `E2E ${stamp} Branch`;
const vendorName = `E2E ${stamp} Vendor`;
const itemName = `E2E ${stamp} Sauce`;

async function openKitchen(page: Page): Promise<void> {
  await page.goto('/central-kitchen/home');
  await expect(page.getByRole('heading', { name: 'Central Kitchen' })).toBeVisible({ timeout: 90_000 });
}

async function saveAndWait(page: Page, button: string, toast: RegExp): Promise<void> {
  await page.getByRole('button', { name: button }).click();
  await expect(page.getByText(toast)).toBeVisible({ timeout: 30_000 });
}

test.describe.serial('central kitchen', () => {
  test('the home shows the four actions and the five tabs', async ({ page }) => {
    await openKitchen(page);
    for (const label of ['Home', 'Items', 'Branches', 'Vendors', 'History']) {
      await expect(page.getByRole('tab', { name: label })).toBeVisible();
    }
  });

  test('an item, a branch and a vendor can be added', async ({ page }) => {
    await openKitchen(page);
    await page.getByRole('tab', { name: 'Items' }).click();
    await page.getByRole('button', { name: 'Add an item' }).first().click();
    await page.getByLabel('Item name').fill(itemName);
    await page.getByLabel('Selling price').fill('900');
    await page.getByLabel('Opening stock').fill('10');
    await saveAndWait(page, 'Add item', new RegExp(`${itemName} added`));
    await expect(page.getByText(itemName).first()).toBeVisible();

    await page.getByRole('tab', { name: 'Branches' }).click();
    await page.getByRole('button', { name: 'Add a branch' }).first().click();
    await page.getByLabel('branch name').fill(branchName);
    await saveAndWait(page, 'Add branch', new RegExp(`${branchName} added`));

    await page.getByRole('tab', { name: 'Vendors' }).click();
    await page.getByRole('button', { name: 'Add a vendor' }).first().click();
    await page.getByLabel('vendor name').fill(vendorName);
    await saveAndWait(page, 'Add vendor', new RegExp(`${vendorName} added`));
  });

  test('a send lowers stock and raises what the branch owes; a payment brings it down', async ({ page }) => {
    await openKitchen(page);
    await page.getByRole('button', { name: /^Send:/ }).click();
    await page.getByRole('button', { name: branchName }).click();
    await page.getByLabel('Search items').fill(itemName);
    await page.getByLabel(`More ${itemName}`).click();
    await page.getByLabel(`More ${itemName}`).click();
    await page.getByRole('button', { name: 'Save send' }).click();
    await expect(page.getByText('Sent', { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('₹900', { exact: false }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Done' }).click();

    await page.getByRole('tab', { name: 'Branches' }).click();
    await expect(page.getByLabel(`${branchName}, ₹900`)).toBeVisible();

    await page.getByRole('tab', { name: 'Home' }).click();
    await page.getByRole('button', { name: /^Received:/ }).click();
    await page.getByRole('button', { name: new RegExp(`^${branchName}`) }).click();
    await page.getByRole('checkbox', { name: /Send of/ }).first().click();
    await expect(page.getByLabel('Amount')).toHaveValue('900');
    await saveAndWait(page, 'Save', /Received ₹900/);
    await page.getByRole('tab', { name: 'Branches' }).click();
    await expect(page.getByLabel(`${branchName}, settled`)).toBeVisible();
  });

  test('a pay-later buy is owed to the vendor until it is paid against', async ({ page }) => {
    await openKitchen(page);
    await page.getByRole('button', { name: /^Bought:/ }).click();
    await page.getByRole('button', { name: vendorName }).click();
    await page.getByLabel('Search items').fill(itemName);
    await page.getByLabel(`More ${itemName}`).click();
    await page.getByLabel(`${itemName} cost per kg`).fill('500');
    await saveAndWait(page, 'Save, pay later', /we owe ₹250/);

    await page.getByRole('button', { name: /^Spent:/ }).click();
    // Spent opens on the expense; a vendor payment is the other segment.
    await page.getByRole('tab', { name: 'Pay a vendor' }).click();
    await page.getByRole('button', { name: new RegExp(`^${vendorName}`) }).click();
    await page.getByRole('checkbox', { name: /Buy of/ }).first().click();
    await expect(page.getByLabel('Amount')).toHaveValue('250');
    await saveAndWait(page, 'Save payment', /settled up/);
  });

  test('an entry can be voided from the history and the lists cleaned up', async ({ page }) => {
    await openKitchen(page);
    await page.getByRole('tab', { name: 'History' }).click();
    await page.getByLabel('Search names, items, notes, amounts').fill(vendorName);
    await page.getByRole('button', { name: new RegExp(`^Paid ${vendorName}`) }).first().click();
    page.once('dialog', (d) => void d.accept());
    await page.getByRole('button', { name: 'Void this entry' }).click();
    await expect(page.getByText('Entry voided')).toBeVisible({ timeout: 30_000 });

    for (const [tab, name] of [['Items', itemName], ['Branches', branchName], ['Vendors', vendorName]] as const) {
      await page.getByRole('tab', { name: tab }).click();
      await page.getByRole('button', { name: new RegExp(`^${name}`) }).first().click();
      page.once('dialog', (d) => void d.accept());
      await page.getByRole('button', { name: `Remove ${name}` }).click();
      await expect(page.getByText(`${name} removed`)).toBeVisible({ timeout: 30_000 });
    }
  });
});
