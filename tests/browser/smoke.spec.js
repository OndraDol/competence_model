const { test, expect } = require('@playwright/test');

test.describe('Competence Model Dashboard — smoke', () => {
    test('index page loads with header, login overlay, country switch', async ({ page }) => {
        await page.goto('/index.html');

        // Header logo + title
        await expect(page.locator('.logo-title')).toContainText(/AURES/i);
        await expect(page.locator('.logo-title span')).toContainText(/Competence Model/i);

        // Country switch has 4 buttons
        for (const code of ['CZ', 'SK', 'PL', 'ALL']) {
            await expect(page.locator(`#nav-btn-${code}`)).toBeVisible();
        }

        // Login overlay is shown when Firebase is not configured (placeholder credentials)
        // OR loading overlay with the "Firebase není nakonfigurován" message appears.
        const firebaseNotConfiguredMessage = page.locator('text=/Firebase není nakonfigurován/i');
        const loginOverlay = page.locator('#loginOverlay');
        const someoneVisible = await Promise.race([
            firebaseNotConfiguredMessage.waitFor({ state: 'visible', timeout: 3000 }).then(() => 'config'),
            loginOverlay.waitFor({ state: 'visible', timeout: 3000 }).then(() => 'login')
        ]).catch(() => null);
        expect(someoneVisible).not.toBeNull();
    });

    test('country switch toggles active state and country filter visibility', async ({ page }) => {
        await page.goto('/index.html');

        // Default is ALL (persisted in localStorage may differ on first run; ensure click works)
        await page.locator('#nav-btn-CZ').click();
        await expect(page.locator('#nav-btn-CZ')).toHaveClass(/active/);
        await expect(page.locator('#filterCountryGroup')).toBeHidden();

        await page.locator('#nav-btn-ALL').click();
        await expect(page.locator('#nav-btn-ALL')).toHaveClass(/active/);
        await expect(page.locator('#filterCountryGroup')).toBeVisible();
    });
});
