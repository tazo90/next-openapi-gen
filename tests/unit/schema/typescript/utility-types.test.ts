import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import * as t from "@babel/types";
import { afterEach, describe, expect, it } from "vitest";

import { resolveUtilityTypeReference } from "@next-openapi-gen/schema/typescript/utility-types.js";
import { parseTypeScriptFile } from "@next-openapi-gen/shared/utils.js";

function createContext(overrides: Record<string, any> = {}) {
  return {
    currentFilePath: "/virtual/schema.ts",
    contentType: "response",
    importMap: {},
    typeDefinitions: {},
    fileAccess: {
      readFileSync: () => "",
    },
    resolveImportPath: () => null,
    resolveTSNodeType: (node: any) => {
      if (t.isTSStringKeyword(node)) return { type: "string" };
      if (t.isTSNumberKeyword(node)) return { type: "number" };
      if (t.isTSTypeReference(node) && t.isIdentifier(node.typeName)) {
        return { $ref: `#/components/schemas/${node.typeName.name}` };
      }
      return { type: "object" };
    },
    findSchemaDefinition: () => ({}),
    collectImports: () => {},
    collectTypeDefinitions: () => {},
    collectAllExportedDefinitions: () => {},
    extractFunctionReturnType: (node: any) => node.returnType?.typeAnnotation ?? null,
    extractFunctionParameters: (node: any) => node.params ?? [],
    extractKeysFromLiteralType: () => [],
    resolveGenericType: () => ({ type: "object", properties: { wrapped: { type: "string" } } }),
    processingTypes: new Set<string>(),
    findTypeDefinition: () => {},
    resolveType: (typeName: string) => ({ $ref: `#/components/schemas/${typeName}` }),
    setResolvingPickOmitBase: () => {},
    ...overrides,
  };
}

describe("TypeScript utility type helpers", () => {
  const roots: string[] = [];

  afterEach(() => {
    roots.splice(0).forEach((root) => fs.rmSync(root, { recursive: true, force: true }));
  });

  it("resolves ReturnType and Parameters from local definitions", () => {
    const source = parseTypeScriptFile(`
      function loadName(): string {
        return "name";
      }
      function setCount(value: number, label: string) {
        return value;
      }
    `);
    const loadName = source.program.body[0];
    const setCount = source.program.body[1];

    const context = createContext({
      typeDefinitions: {
        loadName: loadName,
        setCount: setCount,
      },
      findSchemaDefinition: () => ({}),
    });

    expect(
      resolveUtilityTypeReference(
        t.tsTypeReference(
          t.identifier("ReturnType"),
          t.tsTypeParameterInstantiation([t.tsTypeQuery(t.identifier("loadName"))]),
        ),
        context,
      ),
    ).toEqual({ type: "string" });

    expect(
      resolveUtilityTypeReference(
        t.tsTypeReference(
          t.identifier("Parameters"),
          t.tsTypeParameterInstantiation([t.tsTypeQuery(t.identifier("setCount"))]),
        ),
        context,
      ),
    ).toEqual({
      type: "array",
      prefixItems: [{ type: "number" }, { type: "string" }],
      items: false,
      minItems: 2,
      maxItems: 2,
    });
  });

  it("resolves imported utility functions and pick/omit branches", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-utility-types-"));
    roots.push(root);

    const importedFile = path.join(root, "helpers.ts");
    fs.writeFileSync(importedFile, "function importedName(): string { return 'x'; }");
    const importedAst = parseTypeScriptFile(fs.readFileSync(importedFile, "utf8"));

    const context = createContext({
      currentFilePath: path.join(root, "schema.ts"),
      importMap: {
        [path.join(root, "schema.ts")]: {
          importedName: "./helpers",
        },
      },
      fileAccess: {
        readFileSync: (filePath: string) => fs.readFileSync(filePath, "utf8"),
      },
      resolveImportPath: () => importedFile,
      collectTypeDefinitions: (_ast: any, schemaName: string, filePath?: string) => {
        if (schemaName === "importedName") {
          context.typeDefinitions.importedName = {
            node: importedAst.program.body[0],
            filePath,
          };
        }
      },
      extractKeysFromLiteralType: (node: any) => {
        if (t.isTSLiteralType(node) && t.isStringLiteral(node.literal)) {
          return [node.literal.value];
        }
        return [];
      },
      resolveTSNodeType: (node: any) => {
        if (t.isTSStringKeyword(node)) return { type: "string" };
        if (
          t.isTSTypeReference(node) &&
          t.isIdentifier(node.typeName) &&
          node.typeName.name === "Shape"
        ) {
          return {
            type: "object",
            properties: {
              a: { type: "string" },
              b: { type: "number" },
            },
          };
        }
        return { type: "object" };
      },
    });

    expect(
      resolveUtilityTypeReference(
        t.tsTypeReference(
          t.identifier("ReturnType"),
          t.tsTypeParameterInstantiation([t.tsTypeQuery(t.identifier("importedName"))]),
        ),
        context,
      ),
    ).toEqual({ type: "string" });

    expect(
      resolveUtilityTypeReference(
        t.tsTypeReference(
          t.identifier("Pick"),
          t.tsTypeParameterInstantiation([
            t.tsTypeReference(t.identifier("Shape")),
            t.tsLiteralType(t.stringLiteral("a")),
          ]),
        ),
        context,
      ),
    ).toEqual({
      type: "object",
      properties: {
        a: { type: "string" },
      },
    });
  });

  it("handles fallback utility branches and generic references", () => {
    const context = createContext({
      processingTypes: new Set(["Loop"]),
      typeDefinitions: {
        Wrapper: {
          node: t.tsTypeAliasDeclaration(
            t.identifier("Wrapper"),
            t.tsTypeParameterDeclaration([t.tsTypeParameter(undefined, undefined, "T")]),
            t.tsTypeLiteral([]),
          ),
        },
      },
    });

    expect(
      resolveUtilityTypeReference(
        t.tsTypeReference(
          t.identifier("ReturnType"),
          t.tsTypeParameterInstantiation([t.tsStringKeyword()]),
        ),
        context,
      ),
    ).toEqual({ type: "string" });

    expect(
      resolveUtilityTypeReference(
        t.tsTypeReference(
          t.identifier("Wrapper"),
          t.tsTypeParameterInstantiation([t.tsStringKeyword()]),
        ),
        context,
      ),
    ).toEqual({
      type: "object",
      properties: {
        wrapped: { type: "string" },
      },
    });
    expect(
      resolveUtilityTypeReference(
        t.tsTypeReference(
          t.identifier("Loop"),
          t.tsTypeParameterInstantiation([t.tsStringKeyword()]),
        ),
        context,
      ),
    ).toEqual({
      $ref: "#/components/schemas/Loop",
    });
  });
});
