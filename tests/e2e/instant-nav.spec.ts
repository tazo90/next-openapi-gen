import { instant } from "@next/playwright";
import { expect, test } from "@playwright/test";

import { getE2EAppConfig } from "./apps";

const app = getE2EAppConfig();
const isInstantNavApp = app.name === "next-app-drizzle-zod";

const HOME_SHELL_MARKER = "home-shell-marker";
const API_DOCS_SHELL_MARKER = "api-docs-shell-marker";
const API_DOCS_LINK = "api-docs-link";

test.describe(`${app.name} instant navigation`, () => {
  test.skip(
    !isInstantNavApp,
    "Locked instant() guards run on the App Router sample that has a real <Link> and Cache Components.",
  );

  test("home shell is served under instant()", async ({ page, baseURL }) => {
    await instant(
      page,
      async () => {
        await page.goto("/");
        await expect(page.getByTestId(HOME_SHELL_MARKER)).toBeVisible();
      },
      { baseURL },
    );
  });

  test("api-docs shell commits under instant() from home", async ({ page }) => {
    await page.goto("/");
    const trigger = page.getByTestId(API_DOCS_LINK);
    await expect(trigger).toBeVisible({ timeout: 20_000 });

    await instant(page, async () => {
      await trigger.click();
      await expect(page.getByTestId(API_DOCS_SHELL_MARKER)).toBeVisible();
    });
  });
});
