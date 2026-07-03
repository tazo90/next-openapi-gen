import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  clearTypeScriptRuntimeCache,
  getBestEffortScriptTarget,
  getTypeScriptVersionSupport,
  resolveTypeScriptRuntime,
} from "@workspace/openapi-core/shared/typescript-runtime.js";

describe("TypeScript runtime adapter", () => {
  const roots: string[] = [];

  afterEach(() => {
    clearTypeScriptRuntimeCache();
    roots.splice(0).forEach((root) => fs.rmSync(root, { recursive: true, force: true }));
  });

  it("prefers the TypeScript package installed in the target project", () => {
    const root = createTempRoot("nxog-ts-runtime-local-");
    writeMockTypeScriptPackage(root, "6.0.2", 600);
    const sourceFile = path.join(root, "src", "route.ts");

    const runtime = resolveTypeScriptRuntime(sourceFile);

    expect(runtime.version).toBe("6.0.2");
    expect(fs.realpathSync(runtime.packagePath)).toBe(
      fs.realpathSync(path.join(root, "node_modules", "typescript")),
    );
    expect(runtime.ts).toBeDefined();
    if (!runtime.ts) {
      throw new Error("Expected classic TypeScript runtime to be loaded");
    }
    expect(getBestEffortScriptTarget(runtime.ts)).toBe(600);
  });

  it("falls back to the workspace TypeScript package when a project has none", () => {
    const root = createTempRoot("nxog-ts-runtime-fallback-");
    const sourceFile = path.join(root, "src", "route.ts");

    const runtime = resolveTypeScriptRuntime(sourceFile);

    expect(runtime.version).toMatch(/^5\.9\./);
    expect(runtime.packagePath).not.toContain(root);
    expect(runtime.support).toBe("supported");
  });

  it("keeps runtimes cached separately by resolved package path", () => {
    const firstRoot = createTempRoot("nxog-ts-runtime-first-");
    const secondRoot = createTempRoot("nxog-ts-runtime-second-");
    writeMockTypeScriptPackage(firstRoot, "6.0.2", 600);
    writeMockTypeScriptNativePackage(secondRoot, "7.0.0");

    const firstRuntime = resolveTypeScriptRuntime(path.join(firstRoot, "src", "route.ts"));
    const secondRuntime = resolveTypeScriptRuntime(path.join(secondRoot, "src", "route.ts"));
    const cachedFirstRuntime = resolveTypeScriptRuntime(path.join(firstRoot, "src", "other.ts"));

    expect(firstRuntime.version).toBe("6.0.2");
    expect(secondRuntime.version).toBe("7.0.0");
    expect(firstRuntime.packagePath).not.toBe(secondRuntime.packagePath);
    expect(cachedFirstRuntime).toBe(firstRuntime);
  });

  it("reports supported TypeScript versions from 5.9 through 7.x", () => {
    expect(getTypeScriptVersionSupport("5.8.3")).toBe("too-old");
    expect(getTypeScriptVersionSupport("5.9.3")).toBe("supported");
    expect(getTypeScriptVersionSupport("6.0.2")).toBe("supported");
    expect(getTypeScriptVersionSupport("7.0.0-dev.20260626")).toBe("supported");
    expect(getTypeScriptVersionSupport("8.0.0")).toBe("too-new");
  });

  it("reads TypeScript 7 package metadata without loading a bare package export", () => {
    const root = createTempRoot("nxog-ts-runtime-native-");
    writeMockTypeScriptNativePackage(root, "7.0.1-rc");
    const sourceFile = path.join(root, "src", "route.ts");

    const runtime = resolveTypeScriptRuntime(sourceFile);

    expect(runtime.version).toBe("7.0.1-rc");
    expect(runtime.support).toBe("supported");
    expect(runtime.native).toBeDefined();
    expect(runtime.ts).toBeUndefined();
    expect(fs.realpathSync(runtime.packagePath)).toBe(
      fs.realpathSync(path.join(root, "node_modules", "typescript")),
    );
  });

  function createTempRoot(prefix: string) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    roots.push(root);
    fs.mkdirSync(path.join(root, "src"), { recursive: true });
    return root;
  }
});

function writeMockTypeScriptPackage(root: string, version: string, latestTarget: number) {
  const packageRoot = path.join(root, "node_modules", "typescript");
  fs.mkdirSync(path.join(packageRoot, "lib"), { recursive: true });
  fs.writeFileSync(
    path.join(packageRoot, "package.json"),
    JSON.stringify({ name: "typescript", version, main: "./lib/typescript.js" }),
  );
  fs.writeFileSync(
    path.join(packageRoot, "lib", "typescript.js"),
    `module.exports = { version: ${JSON.stringify(version)}, ScriptTarget: { ES2022: 2022, Latest: ${latestTarget} } };\n`,
  );
}

function writeMockTypeScriptNativePackage(root: string, version: string) {
  const packageRoot = path.join(root, "node_modules", "typescript");
  fs.mkdirSync(path.join(packageRoot, "dist", "api", "sync"), { recursive: true });
  fs.mkdirSync(path.join(packageRoot, "dist", "ast"), { recursive: true });
  fs.writeFileSync(
    path.join(packageRoot, "package.json"),
    JSON.stringify({
      name: "typescript",
      version,
      type: "module",
      exports: {
        "./package.json": "./package.json",
        "./unstable/sync": "./dist/api/sync/api.js",
        "./unstable/ast": "./dist/ast/index.js",
      },
    }),
  );
  fs.writeFileSync(
    path.join(packageRoot, "dist", "api", "sync", "api.js"),
    "export class API {}; export const SymbolFlags = {}; export const TypeFlags = {}; export const ModifierFlags = {}; export const ObjectFlags = {};\n",
  );
  fs.writeFileSync(
    path.join(packageRoot, "dist", "ast", "index.js"),
    "export const SyntaxKind = {};\n",
  );
}
