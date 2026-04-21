const { test, expect } = require('@playwright/test');

const DASHBOARD_URL = '/d-87a28b2d/';

test.describe('Competence Model Dashboard — smoke', () => {
    test('robots.txt disallows all crawlers', async ({ page }) => {
        const response = await page.goto('/robots.txt');
        expect(response.ok()).toBeTruthy();
        const body = await page.locator('body').textContent();
        expect(body).toContain('Disallow: /');
    });

    test('dashboard page loads with password gate', async ({ page }) => {
        await page.goto(DASHBOARD_URL);

        // Header + 4 country buttons render even before unlock
        await expect(page.locator('.logo-title')).toContainText('AURES');
        for (const code of ['CZ', 'SK', 'PL', 'ALL']) {
            await expect(page.locator(`#nav-btn-${code}`)).toBeVisible();
        }

        // Password gate is visible
        await expect(page.locator('#loginOverlay')).toBeVisible();
        await expect(page.locator('#loginPassword')).toBeVisible();
        await expect(page.locator('#loginBtn')).toBeVisible();
    });

    test('dashboard has noindex meta and generic title', async ({ page }) => {
        await page.goto(DASHBOARD_URL);
        await expect(page).toHaveTitle(/^Report$/);
        const robotsContent = await page.locator('meta[name="robots"]').getAttribute('content');
        expect(robotsContent).toMatch(/noindex/);
        expect(robotsContent).toMatch(/nofollow/);
    });

    test('wrong password shows error', async ({ page }) => {
        await page.goto(DASHBOARD_URL);
        await page.locator('#loginPassword').fill('wrong-password-xyz');
        await page.locator('#loginBtn').click();

        // data.enc.json may 404 locally when sync has not been run — either error is fine,
        // the key assertion is that error surface appears and gate remains.
        await page.waitForTimeout(1500);
        await expect(page.locator('#loginError')).toBeVisible();
        await expect(page.locator('#loginOverlay')).toBeVisible();
    });

    test('country switch toggles active state (pre-unlock)', async ({ page }) => {
        await page.goto(DASHBOARD_URL);

        await page.locator('#nav-btn-CZ').click();
        await expect(page.locator('#nav-btn-CZ')).toHaveClass(/active/);

        await page.locator('#nav-btn-ALL').click();
        await expect(page.locator('#nav-btn-ALL')).toHaveClass(/active/);
    });
});
