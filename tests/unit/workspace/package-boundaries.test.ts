import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const workspaceRoot = path.resolve(import.meta.dirname, "..", "..", "..");
const packageRoots = {
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
  "@workspace/openapi-init": path.join(workspaceRoot, "packages", "openapi-init", "src"),
  "next-openapi-gen": path.join(workspaceRoot, "packages", "next-openapi-gen", "src"),
} as const;

const allowedWorkspaceImports: Record<keyof typeof packageRoots, readonly string[]> = {
  "@workspace/openapi-cli": [
    "@workspace/openapi-core",
    "@workspace/openapi-framework-next",
    "@workspace/openapi-framework-react-router",
    "@workspace/openapi-framework-tanstack",
    "@workspace/openapi-init",
  ],
  "@workspace/openapi-core": [],
  "@workspace/openapi-framework-next": ["@workspace/openapi-core", "@workspace/openapi-init"],
  "@workspace/openapi-framework-react-router": ["@workspace/openapi-core"],
  "@workspace/openapi-framework-tanstack": ["@workspace/openapi-core"],
  "@workspace/openapi-init": ["@workspace/openapi-core"],
  "next-openapi-gen": [
    "@workspace/openapi-cli",
    "@workspace/openapi-core",
    "@workspace/openapi-framework-next",
    "@workspace/openapi-framework-react-router",
    "@workspace/openapi-framework-tanstack",
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
      specifiers.push(match[1]!);
    }
  }

  return specifiers;
}
