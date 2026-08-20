import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const workspaceRoot = path.resolve(import.meta.dirname, "..", "..", "..");
const appsDir = path.join(workspaceRoot, "apps");

const LEGACY_CLI_APPS = new Set(["next-app-sandbox", "next-app-swagger"]);

describe("example app generate scripts", () => {
  it("invoke the preferred CLI entry, with a few apps covering the legacy binary", () => {
    const mismatches = fs
      .readdirSync(appsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .flatMap((entry) => {
        const packageJsonPath = path.join(appsDir, entry.name, "package.json");
        if (!fs.existsSync(packageJsonPath)) {
          return [];
        }

        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as {
          scripts?: {
            generate?: string;
          };
        };

        if (!packageJson.scripts?.generate) {
          return [];
        }

        const expected = LEGACY_CLI_APPS.has(entry.name)
          ? "pnpm exec next-openapi-gen generate"
          : "pnpm exec openapi-gen generate";

        return packageJson.scripts.generate === expected
          ? []
          : [`apps/${entry.name}/package.json -> ${packageJson.scripts.generate}`];
      });

    expect(mismatches).toEqual([]);
  });

  it("keeps a mix of modern and legacy config filenames", () => {
    const sampleApps = fs
      .readdirSync(appsDir, { withFileTypes: true })
      .filter(
        (entry) =>
          entry.isDirectory() && fs.existsSync(path.join(appsDir, entry.name, "package.json")),
      );
    const configNames = sampleApps.flatMap((entry) => {
      const appDir = path.join(appsDir, entry.name);
      return [
        "openapi-gen.config.ts",
        "openapi-gen.config.mts",
        "openapi-gen.config.json",
        "next.openapi.json",
      ]
        .filter((fileName) => fs.existsSync(path.join(appDir, fileName)))
        .map((fileName) => `${entry.name}/${fileName}`);
    });

    expect(configNames.some((fileName) => fileName.endsWith("openapi-gen.config.ts"))).toBe(true);
    expect(configNames.some((fileName) => fileName.endsWith("openapi-gen.config.mts"))).toBe(true);
    expect(configNames.some((fileName) => fileName.endsWith("openapi-gen.config.json"))).toBe(true);
    expect(configNames.some((fileName) => fileName.endsWith("next.openapi.json"))).toBe(true);
    expect(configNames).toHaveLength(sampleApps.length);
  });
});
