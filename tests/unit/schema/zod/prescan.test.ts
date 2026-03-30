import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import * as t from "@babel/types";
import { afterEach, describe, expect, it } from "vitest";

import {
  collectImportMetadata,
  extractTypeMappingsFromAST,
  findFactoryFunctionNode,
  findFunctionInAST,
  isZodSchemaNode,
  returnsZodSchemaNode,
  walkTypeScriptFiles,
} from "@workspace/openapi-core/schema/zod/prescan.js";
import { parseTypeScriptFile } from "@workspace/openapi-core/shared/utils.js";

describe("Zod prescan helpers", () => {
  const roots: string[] = [];

  afterEach(() => {
    roots.splice(0).forEach((root) => fs.rmSync(root, { recursive: true, force: true }));
  });

  it("extracts type mappings and import metadata", () => {
    const ast = parseTypeScriptFile(`
      import { z } from "zod";
      import { createInsertSchema } from "drizzle-zod";
      import factory from "./factory";
      import * as namespaceFactory from "./namespace";
      export type User = z.infer<typeof UserSchema>;
    `);

    const localInferAst = t.file(
      t.program([
        t.exportNamedDeclaration(
          t.tsTypeAliasDeclaration(
            t.identifier("LocalInfer"),
            undefined,
            t.tsTypeReference(
              t.identifier("infer"),
              t.tsTypeParameterInstantiation([t.tsTypeQuery(t.identifier("LocalSchema"))]),
            ),
          ),
        ),
      ]),
    );

    expect(extractTypeMappingsFromAST(ast)).toEqual({
      User: "UserSchema",
    });
    expect(extractTypeMappingsFromAST(localInferAst)).toEqual({
      LocalInfer: "LocalSchema",
    });

    const metadata = collectImportMetadata(ast);
    expect(metadata.importedModules).toEqual({
      z: "zod",
      createInsertSchema: "drizzle-zod",
      factory: "./factory",
    });
    expect([...metadata.drizzleZodImports]).toEqual(["createInsertSchema"]);
  });

  it("walks TypeScript files and detects zod schemas", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-prescan-"));
    roots.push(root);
    fs.mkdirSync(path.join(root, "nested"));
    fs.writeFileSync(path.join(root, "a.ts"), "");
    fs.writeFileSync(path.join(root, "nested", "b.tsx"), "");
    fs.writeFileSync(path.join(root, "ignore.js"), "");

    const files: string[] = [];
    walkTypeScriptFiles(root, fs, (filePath) => {
      files.push(path.relative(root, filePath).replace(/\\/g, "/"));
    });

    expect(files.sort()).toEqual(["a.ts", "nested/b.tsx"]);
    expect(
      isZodSchemaNode(parseTypeScriptFile("z.string()").program.body[0] as never, new Set()),
    ).toBe(false);
    expect(
      isZodSchemaNode(
        (parseTypeScriptFile("const x = z.string().optional();").program.body[0] as any)
          .declarations[0].init,
        new Set(),
      ),
    ).toBe(true);
    expect(
      isZodSchemaNode(
        (parseTypeScriptFile("const x = createInsertSchema(table);").program.body[0] as any)
          .declarations[0].init,
        new Set(["createInsertSchema"]),
      ),
    ).toBe(true);
    expect(isZodSchemaNode(t.identifier("plainValue"), new Set())).toBe(false);
  });

  it("finds functions and factory functions through local and imported ASTs", () => {
    const currentAST = parseTypeScriptFile(`
      export function makeLocal() {
        return z.string();
      }
      export const makeArrow = () => z.number();
    `);
    const importedAST = parseTypeScriptFile(`
      export function makeImported() {
        return z.boolean();
      }
    `);

    expect(findFunctionInAST(currentAST, "makeLocal")).toBeTruthy();
    expect(findFunctionInAST(currentAST, "makeArrow")).toBeTruthy();
    expect(findFunctionInAST(currentAST, "missing")).toBeNull();

    const isZodSchema = (node: t.Node) =>
      t.isCallExpression(node) &&
      t.isMemberExpression(node.callee) &&
      t.isIdentifier(node.callee.object, { name: "z" });

    expect(returnsZodSchemaNode(findFunctionInAST(currentAST, "makeLocal")!, isZodSchema)).toBe(
      true,
    );
    expect(returnsZodSchemaNode(t.identifier("value"), isZodSchema)).toBe(false);
    expect(
      returnsZodSchemaNode(
        parseTypeScriptFile(`
          function maybeFactory(flag: boolean) {
            if (flag) return value;
            return anotherValue;
          }
        `).program.body[0] as t.Node,
        isZodSchema,
      ),
    ).toBe(false);

    const importedFile = "/virtual/imported.ts";
    const cachedFactory = new Map<string, t.Node>([["fromCache", t.identifier("cachedFactory")]]);
    expect(
      findFactoryFunctionNode({
        functionName: "fromCache",
        currentFilePath: "/virtual/current.ts",
        currentAST,
        importedModules: {},
        factoryCache: cachedFactory,
        factoryCheckCache: new Map(),
        fileAccess: {
          existsSync: () => true,
        },
        resolveImportPath: () => importedFile,
        parseFileWithCache: () => importedAST,
        isZodSchema,
      }),
    ).toEqual(t.identifier("cachedFactory"));
    expect(
      findFactoryFunctionNode({
        functionName: "alreadyChecked",
        currentFilePath: "/virtual/current.ts",
        currentAST,
        importedModules: {},
        factoryCache: new Map(),
        factoryCheckCache: new Map([["alreadyChecked", false]]),
        fileAccess: {
          existsSync: () => true,
        },
        resolveImportPath: () => importedFile,
        parseFileWithCache: () => importedAST,
        isZodSchema,
      }),
    ).toBeNull();
    expect(
      findFactoryFunctionNode({
        functionName: "makeLocal",
        currentFilePath: "/virtual/current.ts",
        currentAST,
        importedModules: {},
        factoryCache: new Map(),
        factoryCheckCache: new Map(),
        fileAccess: {
          existsSync: () => true,
        },
        resolveImportPath: () => importedFile,
        parseFileWithCache: () => importedAST,
        isZodSchema,
      }),
    ).toBeTruthy();

    expect(
      findFactoryFunctionNode({
        functionName: "makeImported",
        currentFilePath: "/virtual/current.ts",
        currentAST,
        importedModules: { makeImported: "./imported" },
        factoryCache: new Map(),
        factoryCheckCache: new Map(),
        fileAccess: {
          existsSync: (filePath: string) => filePath === importedFile,
        },
        resolveImportPath: () => importedFile,
        parseFileWithCache: () => importedAST,
        isZodSchema,
      }),
    ).toBeTruthy();

    const noReturnFactory = parseTypeScriptFile(`
      export function makeNoSchema() {
        return value;
      }
    `);
    const importedNonSchemaAst = parseTypeScriptFile(`
      export function makeImportedValue() {
        return value;
      }
    `);

    expect(
      findFactoryFunctionNode({
        functionName: "makeNoSchema",
        currentFilePath: "/virtual/current.ts",
        currentAST: noReturnFactory,
        importedModules: {},
        factoryCache: new Map(),
        factoryCheckCache: new Map(),
        fileAccess: {
          existsSync: () => false,
        },
        resolveImportPath: () => null,
        parseFileWithCache: () => null,
        isZodSchema,
      }),
    ).toBeNull();
    expect(
      findFactoryFunctionNode({
        functionName: "makeImportedValue",
        currentFilePath: "/virtual/current.ts",
        currentAST,
        importedModules: { makeImportedValue: "./imported-value" },
        factoryCache: new Map(),
        factoryCheckCache: new Map(),
        fileAccess: {
          existsSync: (filePath: string) => filePath === importedFile,
        },
        resolveImportPath: () => importedFile,
        parseFileWithCache: () => importedNonSchemaAst,
        isZodSchema,
      }),
    ).toBeNull();
  });
});
