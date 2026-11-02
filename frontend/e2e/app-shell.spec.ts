import { expect, test } from '@playwright/test';

test('the web app loads its public shell', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('body')).toContainText(/aangan|darjeeling/i);
});
