import { test } from "@playwright/test";

import { runApiDocsSmokeTest } from "./api-docs-smoke";
import { getE2EAppConfig } from "./apps";

const app = getE2EAppConfig();

test.describe(`${app.name} api docs`, () => {
  test("serves the generated spec and renders api-docs", async ({ page, request }) => {
    await runApiDocsSmokeTest({ app, page, request });
  });
});
