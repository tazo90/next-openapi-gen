import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const workspaceRoot = path.resolve(import.meta.dirname, "..", "..", "..");
const appsDir = path.join(workspaceRoot, "apps");

describe("example app generate scripts", () => {
  it("invoke the preferred CLI alias directly", () => {
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

        return packageJson.scripts.generate === "pnpm exec openapi-gen generate"
          ? []
          : [`apps/${entry.name}/package.json -> ${packageJson.scripts.generate}`];
      });

    expect(mismatches).toEqual([]);
  });
});
