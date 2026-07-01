import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  clearTypeScriptProjectCache,
  getTypeScriptProject,
  invalidateTypeScriptProject,
  resolveTypeScriptModule,
  resolveTypeScriptValueReference,
} from "@workspace/openapi-core/shared/typescript-project.js";
import {
  clearTypeScriptRuntimeCache,
  TypeScriptUnavailableError,
} from "@workspace/openapi-core/shared/typescript-runtime.js";

describe("TypeScript project adapter", () => {
  const roots: string[] = [];

  afterEach(() => {
    clearTypeScriptProjectCache();
    clearTypeScriptRuntimeCache();
    roots.splice(0).forEach((root) => fs.rmSync(root, { recursive: true, force: true }));
  });

  it("throws a typed error when the installed TypeScript package has no classic API", () => {
    const root = createTempRoot("nxog-ts-project-native-");
    writeMockTypeScriptNativePackage(root);
    const sourceFile = path.join(root, "src", "route.ts");
    fs.writeFileSync(sourceFile, "export const value = 1;\n");

    expect(() => getTypeScriptProject(sourceFile)).toThrow(TypeScriptUnavailableError);
  });

  it("does not throw while invalidating a project with unavailable TypeScript", () => {
    const root = createTempRoot("nxog-ts-project-invalidate-native-");
    writeMockTypeScriptNativePackage(root);
    const sourceFile = path.join(root, "src", "route.ts");

    expect(() => invalidateTypeScriptProject(sourceFile)).not.toThrow();
  });

  it("falls back to unresolved modules when native module resolution cannot resolve a file", () => {
    const root = createTempRoot("nxog-ts-project-resolution-native-");
    writeMockTypeScriptNativePackage(root);
    const sourceFile = path.join(root, "src", "route.ts");

    expect(resolveTypeScriptModule("./schema", sourceFile)).toBeNull();
  });

  it("returns a diagnostic for example references when native value resolution cannot find a source file", () => {
    const root = createTempRoot("nxog-ts-project-example-native-");
    writeMockTypeScriptNativePackage(root);
    const sourceFile = path.join(root, "src", "route.ts");

    const result = resolveTypeScriptValueReference("example", sourceFile);

    expect(result.value).toBeUndefined();
    expect(result.diagnostic).toMatchObject({
      code: "example-reference-unresolved",
      severity: "warning",
      filePath: sourceFile,
    });
    expect(result.diagnostic?.message).toContain(
      "source file was not part of the TypeScript project",
    );
  });

  function createTempRoot(prefix: string) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    roots.push(root);
    fs.mkdirSync(path.join(root, "src"), { recursive: true });
    return root;
  }
});

function writeMockTypeScriptNativePackage(root: string) {
  const packageRoot = path.join(root, "node_modules", "typescript");
  fs.mkdirSync(path.join(packageRoot, "dist", "api", "sync"), { recursive: true });
  fs.mkdirSync(path.join(packageRoot, "dist", "ast"), { recursive: true });
  fs.writeFileSync(
    path.join(packageRoot, "package.json"),
    JSON.stringify({
      name: "typescript",
      version: "7.0.1-rc",
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
    `export const ModifierFlags = { Export: 1 };
export const SymbolFlags = { Alias: 1, Function: 2, Type: 4, Value: 8, Variable: 16 };
export const TypeFlags = {};
export const ObjectFlags = {};
export class API {
  updateSnapshot() {
    const project = {
      checker: {},
      compilerOptions: {},
      configFileName: "",
      program: { getSourceFile() { return undefined; } },
    };
    return {
      dispose() {},
      getDefaultProjectForFile() { return project; },
      getProject() { return undefined; },
      getProjects() { return [project]; },
    };
  }
}
`,
  );
  fs.writeFileSync(
    path.join(packageRoot, "dist", "ast", "index.js"),
    "export const SyntaxKind = {};\n",
  );
}
