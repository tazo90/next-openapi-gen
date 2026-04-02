import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const workspaceRoot = path.resolve(import.meta.dirname, "..", "..", "..");
const workspaceDirs = ["apps", "packages"] as const;

describe("workspace Turbo script ownership", () => {
  it("gives linted workspace packages a package-level check script", () => {
    const mismatches = workspaceDirs.flatMap((workspaceDir) => {
      const packagesDir = path.join(workspaceRoot, workspaceDir);

      return fs
        .readdirSync(packagesDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .flatMap((entry) => {
          const packageJsonPath = path.join(packagesDir, entry.name, "package.json");
          if (!fs.existsSync(packageJsonPath)) {
            return [];
          }

          const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as {
            scripts?: Record<string, string | undefined>;
          };

          if (!packageJson.scripts?.lint || !packageJson.scripts["format:check"]) {
            return [];
          }

          return packageJson.scripts.check === "pnpm format:check && pnpm lint"
            ? []
            : [
                `${workspaceDir}/${entry.name}/package.json -> ${packageJson.scripts.check ?? "<missing>"}`,
              ];
        });
    });

    expect(mismatches).toEqual([]);
  });

  it("keeps root workspace orchestration delegated through Turbo", () => {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(workspaceRoot, "package.json"), "utf8"),
    ) as {
      scripts: Record<string, string>;
    };

    expect(packageJson.scripts.build).toBe("turbo run build");
    expect(packageJson.scripts.check).toContain("pnpm exec turbo run check");
    expect(packageJson.scripts.test).toContain("pnpm exec turbo run test:unit");
    expect(packageJson.scripts.test).toContain("pnpm exec turbo run test:integration");
  });

  it("models Knip as a root Turbo task that depends on the built CLI package", () => {
    const turboConfig = JSON.parse(
      fs.readFileSync(path.join(workspaceRoot, "turbo.json"), "utf8"),
    ) as {
      tasks: Record<string, { dependsOn?: string[] }>;
    };

    expect(turboConfig.tasks["//#knip:ci"]?.dependsOn).toEqual(["next-openapi-gen#build"]);
  });
});
