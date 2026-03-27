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
} from "@next-openapi-gen/schema/zod/prescan.js";
import { parseTypeScriptFile } from "@next-openapi-gen/shared/utils.js";

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
      export type User = z.infer<typeof UserSchema>;
    `);

    expect(extractTypeMappingsFromAST(ast)).toEqual({
      User: "UserSchema",
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
      files.push(path.relative(root, filePath));
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

    const importedFile = "/virtual/imported.ts";
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
  });
});
