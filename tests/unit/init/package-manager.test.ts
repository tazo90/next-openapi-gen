import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { getPackageManager, hasDependency } from "@workspace/openapi-init/init/package-manager.js";

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

  it("falls back to pnpm and reports missing dependencies when package.json cannot be read", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-pm-pnpm-"));
    roots.push(root);

    process.chdir(root);

    expect(await getPackageManager()).toBe("pnpm");
    expect(await hasDependency("zod")).toBe(false);
  });

  it("prefers the packageManager field when present", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-pm-package-manager-"));
    const nestedRoot = path.join(root, "apps", "example");
    roots.push(root);

    fs.mkdirSync(nestedRoot, { recursive: true });
    fs.writeFileSync(
      path.join(root, "package.json"),
      JSON.stringify({
        packageManager: "pnpm@10.27.0",
      }),
    );

    process.chdir(nestedRoot);

    expect(await getPackageManager()).toBe("pnpm");
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

  it("detects pnpm-lock.yaml when choosing a package manager", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-pm-pnpm-lock-"));
    roots.push(root);

    fs.writeFileSync(path.join(root, "pnpm-lock.yaml"), "");

    process.chdir(root);

    expect(await getPackageManager()).toBe("pnpm");
  });

  it("honors npm and yarn packageManager fields", async () => {
    const npmRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-pm-npm-field-"));
    roots.push(npmRoot);
    fs.writeFileSync(
      path.join(npmRoot, "package.json"),
      JSON.stringify({ packageManager: "npm@10.0.0" }),
    );
    process.chdir(npmRoot);
    expect(await getPackageManager()).toBe("npm");

    const yarnRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-pm-yarn-field-"));
    roots.push(yarnRoot);
    fs.writeFileSync(
      path.join(yarnRoot, "package.json"),
      JSON.stringify({ packageManager: "yarn@4.0.0" }),
    );
    process.chdir(yarnRoot);
    expect(await getPackageManager()).toBe("yarn");
  });

  it("ignores invalid package.json while still detecting lockfiles", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-pm-invalid-json-"));
    roots.push(root);

    fs.writeFileSync(path.join(root, "package.json"), "{ not json");
    fs.writeFileSync(path.join(root, "pnpm-lock.yaml"), "");

    process.chdir(root);

    expect(await getPackageManager()).toBe("pnpm");
  });
});
