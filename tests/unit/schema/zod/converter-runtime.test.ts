import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import * as t from "@babel/types";
import { afterEach, describe, expect, it, vi } from "vitest";

type MockFn = (...args: unknown[]) => unknown;

import {
  expandFactoryCall,
  extractReturnNode,
  parseFileWithCache,
  resolveImportPath,
  substituteParameters,
} from "@workspace/openapi-core/schema/zod/converter-runtime.js";
import { parseTypeScriptFile } from "@workspace/openapi-core/shared/utils.js";

function getFirstInitializer(source: string): t.Expression {
  const ast = parseTypeScriptFile(`const schema = ${source};`);
  const statement = ast.program.body[0];
  if (!statement || !t.isVariableDeclaration(statement)) {
    throw new Error("Expected variable declaration");
  }

  const initializer = statement.declarations[0]?.init;
  if (!initializer) {
    throw new Error("Expected initializer");
  }

  return initializer;
}

describe("Zod converter runtime helpers", () => {
  const roots: string[] = [];

  afterEach(() => {
    roots.splice(0).forEach((root) => fs.rmSync(root, { recursive: true, force: true }));
  });

  it("parses files with caching and stores imports", () => {
    const filePath = "/virtual/schema.ts";
    const fileASTCache = new Map<string, t.File>();
    const fileImportsCache = new Map<string, Record<string, string>>();
    const drizzleZodImports = new Set<string>();
    const readFileSync = vi.fn<MockFn>((target: string) => {
      if (target === filePath) {
        return [
          'import { z } from "zod";',
          'import { createInsertSchema } from "drizzle-zod";',
          "export const UserSchema = z.string();",
        ].join("\n");
      }

      throw new Error("boom");
    });

    expect(
      parseFileWithCache(
        filePath,
        { existsSync: () => true, readFileSync } as never,
        fileASTCache,
        fileImportsCache,
        drizzleZodImports,
      ),
    ).toBeTruthy();
    expect(
      parseFileWithCache(
        filePath,
        { existsSync: () => true, readFileSync } as never,
        fileASTCache,
        fileImportsCache,
        drizzleZodImports,
      ),
    ).toBeTruthy();
    expect(readFileSync).toHaveBeenCalledTimes(1);
    expect(fileImportsCache.get(filePath)).toEqual({
      z: "zod",
      createInsertSchema: "drizzle-zod",
    });
    expect([...drizzleZodImports]).toEqual(["createInsertSchema"]);

    expect(
      parseFileWithCache(
        "/virtual/broken.ts",
        { existsSync: () => false, readFileSync } as never,
        new Map(),
        new Map(),
        new Set(),
      ),
    ).toBeNull();
  });

  it("resolves import paths and extracts returns from function bodies", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-converter-runtime-"));
    roots.push(root);
    fs.mkdirSync(path.join(root, "factory"), { recursive: true });
    fs.writeFileSync(path.join(root, "factory", "index.ts"), "");
    fs.writeFileSync(path.join(root, "already.ts"), "");
    const currentFile = path.join(root, "schema.ts");

    expect(resolveImportPath(currentFile, "./factory", fs)).toBe(
      path.join(root, "factory", "index.ts"),
    );
    expect(resolveImportPath(currentFile, "./already.ts", fs)).toBe(path.join(root, "already.ts"));
    expect(resolveImportPath(currentFile, "zod", fs)).toBeNull();

    const direct = parseTypeScriptFile("const direct = () => z.string();").program.body[0];
    const conditional = parseTypeScriptFile(`
      function conditional(flag: boolean) {
        if (flag) {
          return z.number();
        }
        return z.boolean();
      }
    `).program.body[0];

    if (!direct || !t.isVariableDeclaration(direct) || !conditional) {
      throw new Error("Expected declarations");
    }

    expect(extractReturnNode(direct.declarations[0]?.init as t.Node)).toBeTruthy();
    expect(extractReturnNode(conditional as t.Node)).toBeTruthy();
    expect(
      extractReturnNode(
        parseTypeScriptFile(`
          function inline(flag: boolean) {
            if (flag) return z.string();
            return z.number();
          }
        `).program.body[0] as t.Node,
      ),
    ).toBeTruthy();
    expect(extractReturnNode(t.identifier("noop"))).toBeNull();
  });

  it("substitutes parameters and expands factory calls", () => {
    const substituted = substituteParameters(
      getFirstInitializer("makeWrappedSchema({ ...input, list: [input, ...items] })"),
      new Map<string, t.Node>([
        ["input", t.identifier("UserSchema")],
        ["items", t.arrayExpression([t.identifier("AuditSchema")])],
      ]),
    );

    expect(t.isCallExpression(substituted)).toBe(true);
    expect(
      expandFactoryCall(
        t.identifier("noop"),
        getFirstInitializer("factory()") as t.CallExpression,
        vi.fn<MockFn>(),
      ),
    ).toBeNull();

    const factoryAst = parseTypeScriptFile(`
      function makeWrappedSchema(itemSchema: any) {
        if (itemSchema) {
          return z.object({ item: itemSchema });
        }
        return z.object({ empty: z.boolean() });
      }
    `);
    const factoryNode = factoryAst.program.body[0];
    if (!factoryNode) {
      throw new Error("Expected function declaration");
    }

    expect(
      expandFactoryCall(
        factoryNode as t.Node,
        getFirstInitializer("makeWrappedSchema(z.string())") as t.CallExpression,
        () => ({ type: "object", properties: { item: { type: "string" } } }),
      ),
    ).toEqual({
      type: "object",
      properties: {
        item: { type: "string" },
      },
    });

    const destructuredFactory = parseTypeScriptFile(`
      function makeWithObject({ itemSchema }: { itemSchema: unknown }) {
        return z.object({ item: z.string() });
      }
    `).program.body[0];
    if (!destructuredFactory) {
      throw new Error("Expected destructured factory");
    }

    expect(
      expandFactoryCall(
        destructuredFactory as t.Node,
        getFirstInitializer("makeWithObject({ itemSchema: z.string() })") as t.CallExpression,
        () => ({ type: "object", properties: { item: { type: "string" } } }),
      ),
    ).toEqual({
      type: "object",
      properties: {
        item: { type: "string" },
      },
    });

    const noReturnFactory = parseTypeScriptFile(`
      function makeNothing(input: string) {
        const value = input;
      }
    `).program.body[0];
    if (!noReturnFactory) {
      throw new Error("Expected no-return factory");
    }

    expect(
      expandFactoryCall(
        noReturnFactory as t.Node,
        getFirstInitializer("makeNothing('x')") as t.CallExpression,
        vi.fn<MockFn>(),
      ),
    ).toBeNull();

    expect(
      expandFactoryCall(
        factoryNode as t.Node,
        getFirstInitializer("makeWrappedSchema(z.string())") as t.CallExpression,
        () => null as never,
      ),
    ).toBeNull();
  });
});
