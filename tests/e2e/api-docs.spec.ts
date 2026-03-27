import { test } from "@playwright/test";

import { getE2EAppConfig } from "./apps";
import { runApiDocsSmokeTest } from "./api-docs-smoke";

const app = getE2EAppConfig();

test.describe(`${app.name} api docs`, () => {
  test("serves the generated spec and renders api-docs", async ({ page, request }) => {
    await runApiDocsSmokeTest({ app, page, request });
  });
});
