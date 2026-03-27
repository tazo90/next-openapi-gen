import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { getPackageManager, hasDependency } from "@next-openapi-gen/init/package-manager.js";

describe("package manager helpers", () => {
  const previousCwd = process.cwd();
  const roots: string[] = [];

  afterEach(() => {
    process.chdir(previousCwd);
    roots.splice(0).forEach((root) => fs.rmSync(root, { recursive: true, force: true }));
  });

  it("detects lockfiles while walking up the directory tree", async () => {
    const yarnRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-pm-yarn-"));
    const nestedRoot = path.join(yarnRoot, "packages", "web");
    roots.push(yarnRoot);

    fs.mkdirSync(nestedRoot, { recursive: true });
    fs.writeFileSync(path.join(yarnRoot, "yarn.lock"), "");

    process.chdir(nestedRoot);
    expect(await getPackageManager()).toBe("yarn");
  });

  it("falls back to npm and reports missing dependencies when package.json cannot be read", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-pm-npm-"));
    roots.push(root);

    process.chdir(root);

    expect(await getPackageManager()).toBe("npm");
    expect(await hasDependency("zod")).toBe(false);
  });

  it("finds dependencies in both dependency sections", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-pm-deps-"));
    roots.push(root);

    fs.writeFileSync(
      path.join(root, "package.json"),
      JSON.stringify({
        dependencies: {
          zod: "^4.0.0",
        },
        devDependencies: {
          typescript: "^5.9.0",
        },
      }),
    );

    process.chdir(root);

    await expect(hasDependency("zod")).resolves.toBe(true);
    await expect(hasDependency("typescript")).resolves.toBe(true);
  });
});
