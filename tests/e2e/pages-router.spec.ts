import { expect, test } from '@playwright/test';

test('serves generated docs for the pages router example', async ({ page }) => {
  await page.goto('/openapi.json');

  const openApiDocument = JSON.parse((await page.locator('body').textContent()) ?? '{}');

  expect(openApiDocument.openapi).toBe('3.0.0');
  expect(openApiDocument.paths['/users/{id}']).toBeDefined();
  await expect(page).toHaveURL(/\/openapi\.json$/);
  await expect(page.locator('body')).toContainText('/users/{id}');
});
