import { expect, test, type Page } from '@playwright/test';
import { hasSavedLogin } from '../playwright.config';

/**
 * Inventory, as the signed-in owner, against the staging database.
 *
 * Everything created here is named "E2E <stamp> …" so it is easy to tell
 * apart and to clean up; the test removes what the screen can remove.
 */
test.skip(!hasSavedLogin, 'Run `npm run e2e:login` once to save a signed-in session.');

const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
const materialName = `E2E ${stamp} Test material`;

async function openInventory(page: Page): Promise<void> {
  await page.goto('/inventory');
  await expect(page.getByText('Stock value, what needs buying, and the waste this month')).toBeVisible({ timeout: 60_000 });
}

/**
 * The sidebar is a narrow rail of icons until the pointer is over it; only
 * then are its labels in the page. So: park the pointer on the rail, wait for
 * the label, click it.
 */
async function openSection(page: Page, label: string): Promise<void> {
  await page.mouse.move(26, 420);
  const item = page.getByText(label, { exact: true }).first();
  await expect(item).toBeVisible();
  await item.click();
}

async function openMaterials(page: Page): Promise<void> {
  await openSection(page, 'Master Setup');
  await openSection(page, 'Raw Materials');
  await expect(page.getByText('Add Raw Material')).toBeVisible();
}

test.describe.serial('raw materials', () => {
  test('the dashboard shows real figures only', async ({ page }) => {
    await openInventory(page);
    await expect(page.getByText('INVENTORY VALUE', { exact: false })).toBeVisible();
    await expect(page.getByText('Most Purchased')).toBeVisible();
    // The invented sample content must stay gone.
    await expect(page.getByText('Al Wadi Foods')).toHaveCount(0);
    await expect(page.getByText('Rami Abou Jaoude')).toHaveCount(0);
    await expect(page.getByText('Jun 1 - Jun 30, 2024')).toHaveCount(0);
  });

  test('a new material with opening stock shows that stock', async ({ page }) => {
    await openInventory(page);
    await openMaterials(page);
    await page.getByText('Add Raw Material').click();
    await expect(page.getByText('Add raw material', { exact: true })).toBeVisible();

    await page.getByLabel('Material name').fill(materialName);
    // Category and unit come pre-selected with the first of each; opening stock is the point.
    await page.getByLabel('Opening stock').fill('12');
    await page.getByText('Save Material').click();

    await expect(page.getByText('Add raw material', { exact: true })).toHaveCount(0);
    const row = page.locator('div').filter({ hasText: materialName }).last();
    await expect(row).toBeVisible();
    await expect(page.getByText(materialName)).toBeVisible();
    // The stock column reads "12 <unit>"; before the fix it read 0.
    await expect(page.getByText(/^12 /).first()).toBeVisible();
  });

  test('a stock adjustment changes the figure', async ({ page }) => {
    await openInventory(page);
    await openMaterials(page);
    await page.getByText('Adjust', { exact: true }).click();
    await expect(page.getByText('Adjust stock', { exact: true })).toBeVisible();

    await page.getByText(materialName).last().click();
    await page.getByLabel('Quantity', { exact: true }).fill('3');
    await page.getByText('Save adjustment').click();
    await expect(page.getByText('Adjust stock', { exact: true })).toHaveCount(0);

    await expect(page.getByText(/^15 /).first()).toBeVisible();
  });

  test('wastage comes off the figure and carries the signed-in name', async ({ page }) => {
    await openInventory(page);
    await openSection(page, 'Wastage');
    await page.getByText('Record Wastage').click();
    await expect(page.getByText('Record wastage', { exact: true })).toBeVisible();

    await page.getByText(materialName).last().click();
    await page.getByLabel('Quantity lost').fill('5');
    const recordedBy = page.getByLabel('Recorded by');
    await expect(recordedBy).not.toHaveValue('');
    await expect(recordedBy).not.toHaveValue('Chef Amit');
    await page.getByText('Save wastage').click();
    await expect(page.getByText('Record wastage', { exact: true })).toHaveCount(0);

    await expect(page.getByText(materialName)).toBeVisible();
    await openMaterials(page);
    await expect(page.getByText(/^10 /).first()).toBeVisible();
  });

  test('removing a material asks first and then removes it', async ({ page }) => {
    await openInventory(page);
    await openMaterials(page);
    const row = page.locator('div').filter({ hasText: materialName }).last();
    await expect(row).toBeVisible();

    let question = '';
    page.once('dialog', (d) => {
      question = d.message();
      void d.accept();
    });
    await page.getByLabel(`Remove ${materialName}`).click();
    await expect.poll(() => question).toContain('Remove');
    await expect(page.getByText(materialName)).toHaveCount(0);
  });
});
