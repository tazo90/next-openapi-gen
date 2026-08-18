import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const workspaceRoot = path.resolve(import.meta.dirname, "..", "..", "..");
const packageRoots = {
  "@workspace/openapi-arazzo": path.join(workspaceRoot, "packages", "openapi-arazzo", "src"),
  "@workspace/openapi-cli": path.join(workspaceRoot, "packages", "openapi-cli", "src"),
  "@workspace/openapi-core": path.join(workspaceRoot, "packages", "openapi-core", "src"),
  "@workspace/openapi-framework-next": path.join(
    workspaceRoot,
    "packages",
    "openapi-framework-next",
    "src",
  ),
  "@workspace/openapi-framework-react-router": path.join(
    workspaceRoot,
    "packages",
    "openapi-framework-react-router",
    "src",
  ),
  "@workspace/openapi-framework-tanstack": path.join(
    workspaceRoot,
    "packages",
    "openapi-framework-tanstack",
    "src",
  ),
  "@workspace/openapi-framework-remix": path.join(
    workspaceRoot,
    "packages",
    "openapi-framework-remix",
    "src",
  ),
  "@workspace/openapi-framework-sveltekit": path.join(
    workspaceRoot,
    "packages",
    "openapi-framework-sveltekit",
    "src",
  ),
  "@workspace/openapi-framework-nuxt": path.join(
    workspaceRoot,
    "packages",
    "openapi-framework-nuxt",
    "src",
  ),
  "@workspace/openapi-framework-astro": path.join(
    workspaceRoot,
    "packages",
    "openapi-framework-astro",
    "src",
  ),
  "@workspace/openapi-framework-hono": path.join(
    workspaceRoot,
    "packages",
    "openapi-framework-hono",
    "src",
  ),
  "@workspace/openapi-framework-express": path.join(
    workspaceRoot,
    "packages",
    "openapi-framework-express",
    "src",
  ),
  "@workspace/openapi-init": path.join(workspaceRoot, "packages", "openapi-init", "src"),
  "@workspace/openapi-overlay": path.join(workspaceRoot, "packages", "openapi-overlay", "src"),
  "next-openapi-gen": path.join(workspaceRoot, "packages", "next-openapi-gen", "src"),
} as const;

const allowedWorkspaceImports: Record<keyof typeof packageRoots, readonly string[]> = {
  "@workspace/openapi-arazzo": ["@workspace/openapi-core"],
  "@workspace/openapi-cli": [
    "@workspace/openapi-arazzo",
    "@workspace/openapi-core",
    "@workspace/openapi-framework-next",
    "@workspace/openapi-framework-react-router",
    "@workspace/openapi-framework-tanstack",
    "@workspace/openapi-framework-remix",
    "@workspace/openapi-framework-sveltekit",
    "@workspace/openapi-framework-nuxt",
    "@workspace/openapi-framework-astro",
    "@workspace/openapi-framework-hono",
    "@workspace/openapi-framework-express",
    "@workspace/openapi-init",
    "@workspace/openapi-overlay",
  ],
  "@workspace/openapi-core": [],
  "@workspace/openapi-framework-next": ["@workspace/openapi-core", "@workspace/openapi-init"],
  "@workspace/openapi-framework-react-router": ["@workspace/openapi-core"],
  "@workspace/openapi-framework-tanstack": ["@workspace/openapi-core"],
  "@workspace/openapi-framework-remix": ["@workspace/openapi-core"],
  "@workspace/openapi-framework-sveltekit": ["@workspace/openapi-core"],
  "@workspace/openapi-framework-nuxt": ["@workspace/openapi-core"],
  "@workspace/openapi-framework-astro": ["@workspace/openapi-core"],
  "@workspace/openapi-framework-hono": ["@workspace/openapi-core"],
  "@workspace/openapi-framework-express": ["@workspace/openapi-core"],
  "@workspace/openapi-init": ["@workspace/openapi-core"],
  "@workspace/openapi-overlay": ["@workspace/openapi-core"],
  "next-openapi-gen": [
    "@workspace/openapi-arazzo",
    "@workspace/openapi-cli",
    "@workspace/openapi-core",
    "@workspace/openapi-framework-next",
    "@workspace/openapi-framework-react-router",
    "@workspace/openapi-framework-tanstack",
    "@workspace/openapi-framework-remix",
    "@workspace/openapi-framework-sveltekit",
    "@workspace/openapi-framework-nuxt",
    "@workspace/openapi-framework-astro",
    "@workspace/openapi-framework-hono",
    "@workspace/openapi-framework-express",
    "@workspace/openapi-overlay",
  ],
};

describe("workspace package boundaries", () => {
  it("keeps cross-package imports on approved package entrypoints", () => {
    const violations: string[] = [];

    for (const [packageName, packageRoot] of Object.entries(packageRoots) as Array<
      [keyof typeof packageRoots, string]
    >) {
      for (const filePath of readTypeScriptFiles(packageRoot)) {
        for (const specifier of getModuleSpecifiers(filePath)) {
          if (specifier.startsWith("@workspace/")) {
            const isAllowed = allowedWorkspaceImports[packageName].some(
              (allowedPrefix) =>
                specifier === allowedPrefix || specifier.startsWith(`${allowedPrefix}/`),
            );

            if (!isAllowed) {
              violations.push(
                `${path.relative(workspaceRoot, filePath)} imports disallowed workspace specifier "${specifier}"`,
              );
            }
            continue;
          }

          if (specifier.startsWith(".")) {
            const resolvedImport = path.resolve(path.dirname(filePath), specifier);
            if (!resolvedImport.startsWith(packageRoot)) {
              violations.push(
                `${path.relative(workspaceRoot, filePath)} escapes its package via relative import "${specifier}"`,
              );
            }
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });
});

function readTypeScriptFiles(directoryPath: string): string[] {
  const filePaths: string[] = [];

  for (const entry of fs.readdirSync(directoryPath, { withFileTypes: true })) {
    const entryPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      filePaths.push(...readTypeScriptFiles(entryPath));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".ts")) {
      filePaths.push(entryPath);
    }
  }

  return filePaths;
}

function getModuleSpecifiers(filePath: string): string[] {
  const source = fs.readFileSync(filePath, "utf8");
  const specifiers: string[] = [];
  const staticImportPattern =
    /\b(?:import|export)\s+(?:type\s+)?(?:[^"'`]+?\s+from\s+)?["']([^"']+)["']/g;
  const dynamicImportPattern = /\bimport\(\s*["']([^"']+)["']\s*\)/g;

  for (const pattern of [staticImportPattern, dynamicImportPattern]) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(source)) !== null) {
      specifiers.push(match[1]);
    }
  }

  return specifiers;
}
