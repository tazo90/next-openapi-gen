import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createNextDocsPage } from "@next-openapi-gen/frameworks/next/docs-page-processor.js";

describe("createNextDocsPage", () => {
  const previousCwd = process.cwd();
  const roots: string[] = [];

  afterEach(() => {
    process.chdir(previousCwd);
    roots.splice(0).forEach((root) => fs.rmSync(root, { recursive: true, force: true }));
  });

  it("writes docs pages under src/app when src exists", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-docs-page-src-"));
    roots.push(root);
    fs.mkdirSync(path.join(root, "src"), { recursive: true });
    process.chdir(root);

    const pagePath = await createNextDocsPage("developer/reference", "scalar", "openapi.json");

    expect(pagePath).toBe("src/app/developer/reference/page.tsx");
    expect(fs.existsSync(path.join(root, "src", "app", "developer", "reference", "page.tsx"))).toBe(
      true,
    );
  });

  it("writes docs pages under app when src does not exist", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-docs-page-app-"));
    roots.push(root);
    process.chdir(root);

    const pagePath = await createNextDocsPage("api-docs", "scalar", "openapi.json");

    expect(pagePath).toBe("app/api-docs/page.tsx");
    expect(fs.existsSync(path.join(root, "app", "api-docs", "page.tsx"))).toBe(true);
  });

  it('returns null when ui is "none"', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-docs-page-none-"));
    roots.push(root);
    process.chdir(root);

    await expect(createNextDocsPage("api-docs", "none", "openapi.json")).resolves.toBeNull();
    expect(fs.existsSync(path.join(root, "app", "api-docs", "page.tsx"))).toBe(false);
  });
});
