import fs from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createDocsPage } from "@next-openapi-gen/init/create-docs-page.js";

import { createTempProject } from "../../helpers/test-project.js";

describe("createDocsPage", () => {
  const previousCwd = process.cwd();

  afterEach(() => {
    process.chdir(previousCwd);
  });

  it("uses docsUrl to determine the generated app route path", async () => {
    const project = createTempProject("nxog-docs-path-");

    try {
      process.chdir(project.root);

      const pagePath = await createDocsPage("developer/reference", "scalar", "openapi.json");

      expect(pagePath).toBe("src/app/developer/reference/page.tsx");
      expect(
        fs.existsSync(path.join(project.root, "src", "app", "developer", "reference", "page.tsx")),
      ).toBe(true);
    } finally {
      project.cleanup();
    }
  });
});
