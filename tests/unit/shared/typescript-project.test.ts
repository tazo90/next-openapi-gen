import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  clearTypeScriptProjectCache,
  getTypeScriptAdapter,
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

  it("throws a typed error when the installed TypeScript package is too old", () => {
    const root = createTempRoot("nxog-ts-project-old-");
    const packageRoot = path.join(root, "node_modules", "typescript");
    fs.mkdirSync(path.join(packageRoot, "lib"), { recursive: true });
    fs.writeFileSync(
      path.join(packageRoot, "package.json"),
      JSON.stringify({ name: "typescript", version: "5.8.3", main: "./lib/typescript.js" }),
    );
    fs.writeFileSync(
      path.join(packageRoot, "lib", "typescript.js"),
      "module.exports = { version: '5.8.3', ScriptTarget: { ES2022: 2022 } };\n",
    );
    const sourceFile = path.join(root, "src", "route.ts");
    fs.writeFileSync(sourceFile, "export const value = 1;\n");

    expect(() => getTypeScriptProject(sourceFile)).toThrow(TypeScriptUnavailableError);
    expect(resolveTypeScriptModule("./schema", sourceFile)).toBeNull();
    expect(resolveTypeScriptValueReference("value", sourceFile).diagnostic?.code).toBe(
      "example-reference-unresolved",
    );
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

  it("creates a single-file program when only a solution-style tsconfig.json is present", () => {
    const root = createTempRoot("nxog-ts-project-solution-");
    fs.writeFileSync(
      path.join(root, "tsconfig.json"),
      JSON.stringify({
        files: [],
        references: [{ path: "./pkg" }],
      }),
    );
    const sourceFile = path.join(root, "src", "route.ts");
    fs.writeFileSync(sourceFile, "export type User = { id: number };\n");

    const project = getTypeScriptProject(sourceFile);

    expect(project.program.getSourceFile(sourceFile)).toBeDefined();
  });

  it("uses an injected compiler host factory", () => {
    const root = createTempRoot("nxog-ts-project-host-");
    fs.writeFileSync(
      path.join(root, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: { strict: true },
        include: ["src/**/*.ts"],
      }),
    );
    const sourceFile = path.join(root, "src", "route.ts");
    fs.writeFileSync(sourceFile, "export type User = { id: number };\n");
    let hostCalls = 0;

    const project = getTypeScriptProject(sourceFile, {
      createCompilerHost: (ts, compilerOptions) => {
        hostCalls += 1;
        return ts.createCompilerHost(compilerOptions, true);
      },
    });

    expect(hostCalls).toBe(1);
    expect(project.program.getSourceFile(sourceFile)).toBeDefined();
    expect(getTypeScriptProject(sourceFile).program).toBe(project.program);
  });

  it("resolves relative modules, value references, and incremental invalidation", () => {
    const root = createTempRoot("nxog-ts-project-classic-");
    fs.writeFileSync(
      path.join(root, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: { strict: true, moduleResolution: "bundler" },
        include: ["src/**/*.ts"],
      }),
    );
    const schemaFile = path.join(root, "src", "schema.ts");
    const sourceFile = path.join(root, "src", "route.ts");
    fs.writeFileSync(schemaFile, "export const example = { id: 1 } as const;\n");
    fs.writeFileSync(
      sourceFile,
      `import { example } from "./schema";
export const copied = example;
`,
    );

    expect(resolveTypeScriptModule("./schema", sourceFile)).toBe(schemaFile);
    expect(resolveTypeScriptModule("./missing", sourceFile)).toBeNull();
    expect(resolveTypeScriptValueReference("example", schemaFile).value).toEqual({ id: 1 });
    expect(resolveTypeScriptValueReference("missing", schemaFile).diagnostic?.code).toBe(
      "example-reference-unresolved",
    );

    invalidateTypeScriptProject(sourceFile);
    expect(getTypeScriptProject(sourceFile).program.getSourceFile(sourceFile)).toBeDefined();
  });

  it("reuses the classic adapter and evaluates serializable value references", () => {
    const root = createTempRoot("nxog-ts-project-values-");
    fs.writeFileSync(
      path.join(root, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: { strict: true, moduleResolution: "bundler" },
        include: ["src/**/*.ts"],
      }),
    );
    const sourceFile = path.join(root, "src", "values.ts");
    fs.writeFileSync(
      sourceFile,
      `
const id = 7;
const nested = { inner: 1 };
export const negated = -3;
export const plused = +4;
export const notted = !false;
export const tilded = ~1;
let n = 1;
export const inc = ++n;
export const dec = --n;
export const frozen = Object.freeze({ a: 1, b: true, c: null, d: "ok" });
export const frozenEmpty = Object.freeze();
export const parsed = schema.parse({ id: 2 });
export const parsedEmpty = schema.parse();
export const items = [1, ...[2, 3], true, false, null];
export const badSpread = { ...1 };
export const cycle = { get self() { return cycle; } };
export const cycleRef = cycleRef;
export const spread = { ...nested, id, "quoted": 8, 9: 9 };
export const asserted = ({ x: 1 } as const);
export const satisfied = ({ y: 2 } satisfies { y: number });
export const paren = ({ z: 3 });
export const nonnull = ({ w: 4 }!);
export enum Direction { Up = "up", Down }
export function helper() { return 1; }
export const unserializable = helper;
`,
    );
    const typesFile = path.join(root, "src", "types.d.ts");
    fs.writeFileSync(typesFile, "export declare const fromTypes: string;\n");
    const importer = path.join(root, "src", "route.ts");
    fs.writeFileSync(
      importer,
      `import { fromTypes } from "./types";\nexport const copied = fromTypes;\n`,
    );

    const adapter = getTypeScriptAdapter(sourceFile);
    expect(adapter.kind).toBe("classic");
    expect(getTypeScriptAdapter(sourceFile)).toBe(adapter);
    expect(() => adapter.inferResponsesForExports(sourceFile, ["GET"])).toThrow(
      /Classic response inference/,
    );
    expect(() => adapter.resolveTypeByName("User", sourceFile)).toThrow(/Classic schema fallback/);

    expect(resolveTypeScriptValueReference("negated", sourceFile).value).toBe(-3);
    expect(resolveTypeScriptValueReference("plused", sourceFile).value).toBe(4);
    expect(resolveTypeScriptValueReference("notted", sourceFile).value).toBeUndefined();
    expect(resolveTypeScriptValueReference("tilded", sourceFile).value).toBeUndefined();
    expect(resolveTypeScriptValueReference("inc", sourceFile).value).toBeUndefined();
    expect(resolveTypeScriptValueReference("dec", sourceFile).value).toBeUndefined();
    expect(resolveTypeScriptValueReference("frozenEmpty", sourceFile).value).toBeUndefined();
    expect(resolveTypeScriptValueReference("parsedEmpty", sourceFile).value).toBeUndefined();
    expect(resolveTypeScriptValueReference("badSpread", sourceFile).value).toBeUndefined();
    expect(resolveTypeScriptValueReference("cycle", sourceFile).value).toEqual({});
    expect(resolveTypeScriptValueReference("cycleRef", sourceFile).value).toBeUndefined();
    expect(resolveTypeScriptValueReference("frozen", sourceFile).value).toEqual({
      a: 1,
      b: true,
      c: null,
      d: "ok",
    });
    expect(resolveTypeScriptValueReference("parsed", sourceFile).value).toEqual({ id: 2 });
    expect(resolveTypeScriptValueReference("items", sourceFile).value).toEqual([
      1,
      2,
      3,
      true,
      false,
      null,
    ]);
    expect(resolveTypeScriptValueReference("spread", sourceFile).value).toMatchObject({
      inner: 1,
      id: 7,
      quoted: 8,
    });
    expect(resolveTypeScriptValueReference("asserted", sourceFile).value).toEqual({ x: 1 });
    expect(resolveTypeScriptValueReference("satisfied", sourceFile).value).toEqual({ y: 2 });
    expect(resolveTypeScriptValueReference("paren", sourceFile).value).toEqual({ z: 3 });
    expect(resolveTypeScriptValueReference("nonnull", sourceFile).value).toEqual({ w: 4 });
    expect(resolveTypeScriptValueReference("Direction", sourceFile).diagnostic?.code).toBe(
      "example-reference-unserializable",
    );
    expect(resolveTypeScriptValueReference("unserializable", sourceFile).diagnostic?.code).toBe(
      "example-reference-unserializable",
    );
    expect(resolveTypeScriptModule("./types", importer)).toBeNull();

    invalidateTypeScriptProject(path.join(root, "src", "missing.ts"));
    adapter.clear();
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
  close() {}
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
