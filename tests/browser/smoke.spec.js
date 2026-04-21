const { test, expect } = require('@playwright/test');

test('index page loads with main panels', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('h1')).toHaveText(/Competence Model/i);
  await expect(page.locator('#results')).toBeVisible();
  await expect(page.locator('#crosscheck')).toBeVisible();
});
