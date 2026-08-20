import * as t from "@babel/types";
import { describe, expect, it } from "vitest";

import {
  applyPropertyOpenApiOverride,
  enumerateTemplateLiteralType,
  isBinaryNode,
  resolveTypeNodeSchema,
  tryBuildTemplateLiteralPattern,
  tryResolveTemplateLiteralEnum,
} from "@workspace/openapi-core/schema/typescript/type-node-schema.js";
import { parseTypeScriptFile } from "@workspace/openapi-core/shared/parse-typescript.js";

function parseAnnotation(source: string): t.TSType {
  const ast = parseTypeScriptFile(`let _x: ${source};`);
  const declaration = ast.program.body[0] as t.VariableDeclaration;
  const idNode = declaration.declarations[0]?.id as t.Identifier;
  return (idNode.typeAnnotation as t.TSTypeAnnotation).typeAnnotation;
}

describe("type-node-schema helpers", () => {
  it("classifies binary nodes and enumerates leftover template literal branches", () => {
    expect(isBinaryNode(parseAnnotation("File"))).toBe(true);
    expect(isBinaryNode(parseAnnotation("Blob"))).toBe(true);
    expect(isBinaryNode(parseAnnotation("Buffer"))).toBe(true);
    expect(isBinaryNode(parseAnnotation("ArrayBuffer"))).toBe(true);
    expect(isBinaryNode(parseAnnotation("Uint8Array"))).toBe(true);
    expect(isBinaryNode(parseAnnotation("ReadableStream"))).toBe(true);
    expect(isBinaryNode(parseAnnotation("string"))).toBe(false);
    expect(isBinaryNode(t.tsStringKeyword())).toBe(false);

    expect(enumerateTemplateLiteralType(null)).toBeNull();
    expect(enumerateTemplateLiteralType(t.tsLiteralType(t.stringLiteral("a")))).toEqual(["a"]);
    expect(enumerateTemplateLiteralType(t.tsLiteralType(t.numericLiteral(2)))).toEqual(["2"]);
    expect(enumerateTemplateLiteralType(t.tsLiteralType(t.booleanLiteral(true)))).toEqual(["true"]);
    expect(
      enumerateTemplateLiteralType({
        type: "TSLiteralType",
        literal: { type: "NullLiteral" },
      }),
    ).toBeNull();
    expect(
      enumerateTemplateLiteralType(
        t.tsUnionType([
          t.tsLiteralType(t.stringLiteral("a")),
          t.tsLiteralType(t.numericLiteral(1)),
        ]),
      ),
    ).toEqual(["a", "1"]);
    expect(enumerateTemplateLiteralType(t.tsUnionType([t.tsStringKeyword()]))).toBeNull();
    expect(enumerateTemplateLiteralType(t.tsStringKeyword())).toBeNull();

    const fixed = t.tsTemplateLiteralType(
      [t.templateElement({ raw: "fixed", cooked: "fixed" }, true)],
      [],
    );
    expect(tryResolveTemplateLiteralEnum(fixed)).toEqual({ type: "string", enum: ["fixed"] });
    const uppercaseTemplate = t.tsTemplateLiteralType(
      [
        t.templateElement({ raw: "", cooked: "" }, false),
        t.templateElement({ raw: "", cooked: "" }, true),
      ],
      [t.tsTypeReference(t.identifier("Uppercase"))],
    );
    expect(tryBuildTemplateLiteralPattern(uppercaseTemplate)).toBe("^.+$");
    const booleanTemplate = t.tsTemplateLiteralType(
      [
        t.templateElement({ raw: "", cooked: "" }, false),
        t.templateElement({ raw: "", cooked: "" }, true),
      ],
      [t.tsBooleanKeyword()],
    );
    expect(tryBuildTemplateLiteralPattern(booleanTemplate)).toBeNull();

    const numberTemplate = t.tsTemplateLiteralType(
      [
        t.templateElement({ raw: "v", cooked: "v" }, false),
        t.templateElement({ raw: "", cooked: "" }, true),
      ],
      [t.tsNumberKeyword()],
    );
    expect(tryBuildTemplateLiteralPattern(numberTemplate)).toBe("^v\\d+$");

    const uncooked = t.tsTemplateLiteralType([t.templateElement({ raw: "fixed" }, true)], []);
    uncooked.quasis[0].value.cooked = undefined;
    expect(tryResolveTemplateLiteralEnum(uncooked)).toEqual({ type: "string", enum: [""] });
    expect(tryBuildTemplateLiteralPattern(uncooked)).toBe("^$");

    const mixedEnum = t.tsTemplateLiteralType(
      [
        t.templateElement({ raw: "", cooked: "" }, false),
        t.templateElement({ raw: "-", cooked: "-" }, false),
        t.templateElement({ raw: "", cooked: undefined }, true),
      ],
      [
        t.tsUnionType([
          t.tsLiteralType(t.stringLiteral("a")),
          t.tsLiteralType(t.stringLiteral("b")),
        ]),
        t.tsLiteralType(t.numericLiteral(1)),
      ],
    );
    expect(tryResolveTemplateLiteralEnum(mixedEnum)).toEqual({
      type: "string",
      enum: ["a-1", "b-1"],
    });

    applyPropertyOpenApiOverride(
      { leadingComments: [{ value: "* @see other" }] },
      { type: "string" },
    );
    applyPropertyOpenApiOverride({ leadingComments: [{ value: undefined }] }, { type: "string" });

    const emptyQuasis = {
      type: "TSTemplateLiteralType",
      quasis: [],
      types: [t.tsLiteralType(t.stringLiteral("a"))],
    } as unknown as t.TSTemplateLiteralType;
    expect(tryResolveTemplateLiteralEnum(emptyQuasis)).toEqual({ type: "string", enum: ["a"] });

    const cookedMissing = t.tsTemplateLiteralType(
      [
        t.templateElement({ raw: "pre", cooked: "pre" }, false),
        t.templateElement({ raw: "post", cooked: "post" }, true),
      ],
      [t.tsLiteralType(t.stringLiteral("x"))],
    );
    cookedMissing.quasis[0].value.cooked = undefined;
    cookedMissing.quasis[1].value.cooked = undefined;
    expect(tryResolveTemplateLiteralEnum(cookedMissing)).toEqual({
      type: "string",
      enum: ["x"],
    });
    cookedMissing.types = [t.tsStringKeyword()];
    expect(tryBuildTemplateLiteralPattern(cookedMissing)).toBe("^.+$");

    const sparseTypes = t.tsTemplateLiteralType(
      [
        t.templateElement({ raw: "", cooked: "" }, false),
        t.templateElement({ raw: "", cooked: "" }, true),
      ],
      [t.tsStringKeyword()],
    );
    sparseTypes.types[0] = undefined as never;
    expect(tryBuildTemplateLiteralPattern(sparseTypes)).toBeNull();
  });

  it("applies property overrides and leftover resolveTypeNodeSchema branches", () => {
    const property = { type: "string" };
    applyPropertyOpenApiOverride({ leadingComments: [] }, property);
    expect(property).toEqual({ type: "string" });
    applyPropertyOpenApiOverride(
      { leadingComments: [{ value: '* @openapi-override {"example":"x"}' }] },
      property,
    );
    expect(property).toMatchObject({ example: "x" });

    const host = {
      addTypeResolutionFallbackDiagnostic() {},
      areTypesStaticallyCompatible: () => true,
      contentType: "response" as const,
      currentFilePath: "/virtual.ts",
      extractKeysFromTypeNode: () => [] as string[],
      openapiDefinitions: {} as Record<string, unknown>,
      processSchemaFile: () => {},
      resolveImportPath: () => null,
      resolveType: () => ({ type: "object" }),
      schemaTypes: ["typescript"] as string[],
      typeDefinitions: {} as Record<string, unknown>,
      unwrapSchemaProperties: () => null,
      zodSchemaConverter: undefined,
    };

    expect(resolveTypeNodeSchema(host as never, null)).toEqual({ type: "object" });
    expect(resolveTypeNodeSchema(host as never, parseAnnotation("Promise"))).toEqual({});
    expect(resolveTypeNodeSchema(host as never, parseAnnotation("Array"))).toEqual({
      type: "array",
    });
    expect(resolveTypeNodeSchema(host as never, parseAnnotation("ReadonlyArray<string>"))).toEqual({
      type: "array",
      items: { type: "string" },
    });
    expect(
      resolveTypeNodeSchema(host as never, parseAnnotation("Map<string, number>")),
    ).toMatchObject({
      type: "object",
      additionalProperties: { type: "number" },
    });
    expect(
      resolveTypeNodeSchema(host as never, parseAnnotation("Map<number, string>")),
    ).toMatchObject({
      type: "object",
      propertyNames: { type: "number" },
    });
    expect(resolveTypeNodeSchema(host as never, parseAnnotation("Map"))).toEqual({
      type: "object",
      additionalProperties: true,
    });
    expect(resolveTypeNodeSchema(host as never, parseAnnotation("Set<string>"))).toEqual({
      type: "array",
      items: { type: "string" },
      uniqueItems: true,
    });
    expect(resolveTypeNodeSchema(host as never, parseAnnotation("Set"))).toEqual({
      type: "array",
      uniqueItems: true,
    });
    expect(resolveTypeNodeSchema(host as never, parseAnnotation("unique symbol"))).toBeDefined();
    expect(resolveTypeNodeSchema(host as never, parseAnnotation("keyof string"))).toEqual({
      type: "string",
    });
    expect(resolveTypeNodeSchema(host as never, parseAnnotation("() => void"))).toEqual({});
    expect(resolveTypeNodeSchema(host as never, parseAnnotation("new () => object"))).toEqual({});
    expect(
      resolveTypeNodeSchema(
        host as never,
        parseAnnotation('{ "full-name": string; [k: string]: string }'),
      ),
    ).toMatchObject({
      type: "object",
      properties: { "full-name": { type: "string" } },
    });

    expect(resolveTypeNodeSchema(host as never, parseAnnotation("Date"))).toEqual({
      type: "string",
      format: "date-time",
    });
    expect(resolveTypeNodeSchema(host as never, parseAnnotation("bigint"))).toEqual({
      type: "integer",
      format: "int64",
    });
    expect(resolveTypeNodeSchema(host as never, parseAnnotation("symbol"))).toEqual({
      type: "string",
    });
    expect(resolveTypeNodeSchema(host as never, parseAnnotation("object"))).toEqual({
      type: "object",
      additionalProperties: true,
    });
    expect(resolveTypeNodeSchema(host as never, parseAnnotation("never"))).toEqual({ not: {} });
    expect(resolveTypeNodeSchema(host as never, parseAnnotation("any"))).toEqual({});
    expect(resolveTypeNodeSchema(host as never, parseAnnotation("unknown"))).toEqual({});
    expect(resolveTypeNodeSchema(host as never, parseAnnotation("void"))).toEqual({ type: "null" });
    expect(resolveTypeNodeSchema(host as never, parseAnnotation("null"))).toEqual({ type: "null" });
    expect(resolveTypeNodeSchema(host as never, parseAnnotation("undefined"))).toEqual({
      type: "null",
    });
    expect(resolveTypeNodeSchema(host as never, parseAnnotation('"admin"'))).toEqual({
      type: "string",
      enum: ["admin"],
    });
    expect(resolveTypeNodeSchema(host as never, parseAnnotation("1"))).toEqual({
      type: "number",
      enum: [1],
    });
    expect(resolveTypeNodeSchema(host as never, parseAnnotation("true"))).toEqual({
      type: "boolean",
      enum: [true],
    });
    expect(resolveTypeNodeSchema(host as never, parseAnnotation("string | number"))).toBeDefined();
    expect(
      resolveTypeNodeSchema(host as never, parseAnnotation("string & { id: string }")),
    ).toBeDefined();
    expect(resolveTypeNodeSchema(host as never, parseAnnotation("[string, number][0]"))).toEqual({
      type: "string",
    });
    expect(resolveTypeNodeSchema(host as never, parseAnnotation("[string, number][9]"))).toEqual({
      type: "object",
    });
    expect(resolveTypeNodeSchema(host as never, parseAnnotation("string[][0]"))).toEqual({
      type: "string",
    });
    expect(resolveTypeNodeSchema(host as never, parseAnnotation('{ id: string }["id"]'))).toEqual({
      type: "string",
    });
    expect(
      resolveTypeNodeSchema(host as never, parseAnnotation('{ id: string }["missing"]')),
    ).toEqual({ type: "object" });
    expect(
      resolveTypeNodeSchema(host as never, parseAnnotation("true extends true ? string : number")),
    ).toEqual({ type: "string" });
    expect(
      resolveTypeNodeSchema(
        { ...host, areTypesStaticallyCompatible: () => false },
        parseAnnotation("true extends false ? string : number"),
      ),
    ).toEqual({ type: "number" });
    expect(
      resolveTypeNodeSchema(host as never, parseAnnotation("{ [K in never]: string }")),
    ).toEqual({ type: "object", properties: {} });
    expect(
      resolveTypeNodeSchema(
        { ...host, extractKeysFromTypeNode: () => ["id"] },
        parseAnnotation("{ [K in 'id']: string }"),
      ),
    ).toMatchObject({
      type: "object",
      properties: { id: { type: "string" } },
    });
    expect(resolveTypeNodeSchema(host as never, parseAnnotation("import('mod').User"))).toEqual({
      type: "object",
    });
    expect(
      resolveTypeNodeSchema(host as never, parseAnnotation("readonly string[]")),
    ).toMatchObject({
      readOnly: true,
    });
    expect(resolveTypeNodeSchema(host as never, parseAnnotation("keyof { id: string }"))).toEqual({
      type: "string",
    });
    expect(resolveTypeNodeSchema(host as never, parseAnnotation("unique symbol"))).toEqual({
      type: "string",
    });
    expect(
      resolveTypeNodeSchema(
        {
          ...host,
          schemaTypes: ["zod"],
          zodSchemaConverter: {
            convertZodSchemaToOpenApi: () => ({
              type: "object",
              properties: { id: { type: "string" } },
            }),
          },
        },
        parseAnnotation("z.infer<typeof UserSchema>"),
      ),
    ).toEqual({ type: "object", properties: { id: { type: "string" } } });
    expect(
      resolveTypeNodeSchema(
        {
          ...host,
          schemaTypes: ["zod"],
          zodSchemaConverter: {
            convertZodSchemaToOpenApi: () => null,
          },
        },
        parseAnnotation("z.infer<typeof MissingSchema>"),
      ),
    ).toEqual({ type: "object" });
    expect(
      resolveTypeNodeSchema(
        {
          ...host,
          resolveImportPath: () => "/virtual/imported.ts",
          processSchemaFile: () => ({ type: "string" }),
        },
        parseAnnotation("import('mod').User"),
      ),
    ).toBeDefined();
    expect(resolveTypeNodeSchema(host as never, parseAnnotation("Promise<string>"))).toEqual({
      type: "string",
    });
    expect(resolveTypeNodeSchema(host as never, parseAnnotation("Awaited<number>"))).toEqual({
      type: "number",
    });
    expect(resolveTypeNodeSchema(host as never, parseAnnotation("Awaited"))).toEqual({});
    expect(
      resolveTypeNodeSchema(host as never, parseAnnotation("Record<string, boolean>")),
    ).toMatchObject({
      type: "object",
    });
    expect(
      resolveTypeNodeSchema(host as never, parseAnnotation("[string, ...number[]]")),
    ).toMatchObject({
      type: "array",
    });
    expect(resolveTypeNodeSchema(host as never, parseAnnotation("[id?: string]"))).toMatchObject({
      type: "array",
    });
    expect(
      resolveTypeNodeSchema(
        {
          ...host,
          unwrapSchemaProperties: () => ({ id: { type: "string" }, name: { type: "string" } }),
        },
        parseAnnotation("keyof { id: string; name: string }"),
      ),
    ).toEqual({ type: "string", enum: ["id", "name"] });
    expect(
      resolveTypeNodeSchema(host as never, parseAnnotation("`user-${'a' | 'b'}`")),
    ).toMatchObject({
      type: "string",
    });
    expect(
      resolveTypeNodeSchema(
        {
          ...host,
          schemaTypes: ["zod"],
          zodSchemaConverter: {
            convertZodSchemaToOpenApi: () => ({
              type: "object",
              properties: { id: { type: "string" } },
            }),
          },
        },
        parseAnnotation("z.infer<typeof UserSchema>"),
      ),
    ).toEqual({ type: "object", properties: { id: { type: "string" } } });
    expect(
      resolveTypeNodeSchema(host as never, {
        type: "TSExpressionWithTypeArguments",
        expression: t.identifier("Date"),
      }),
    ).toEqual({ type: "string", format: "date-time" });
    expect(
      resolveTypeNodeSchema(host as never, {
        type: "TSExpressionWithTypeArguments",
        expression: t.numericLiteral(1),
      }),
    ).toEqual({ type: "object" });
    expect(
      resolveTypeNodeSchema(
        host as never,
        parseAnnotation("{ readonly id: string; [key: string]: string }"),
      ),
    ).toMatchObject({
      type: "object",
      properties: { id: expect.objectContaining({ readOnly: true }) },
      additionalProperties: { type: "string" },
    });
    expect(
      resolveTypeNodeSchema(host as never, parseAnnotation("{ [key: string]: unknown }")),
    ).toMatchObject({
      additionalProperties: {},
    });
    expect(resolveTypeNodeSchema(host as never, parseAnnotation('"a" | 1 | true'))).toMatchObject({
      oneOf: expect.any(Array),
    });
    expect(resolveTypeNodeSchema(host as never, parseAnnotation("string | undefined"))).toEqual({
      type: "string",
    });
    expect(
      resolveTypeNodeSchema(host as never, parseAnnotation("string & { __brand: 'UserId' }")),
    ).toEqual({ type: "string" });
    expect(
      resolveTypeNodeSchema(
        host as never,
        parseAnnotation("{ optional?: string } & { extra?: number }"),
      ),
    ).toMatchObject({
      type: "object",
      properties: expect.objectContaining({
        optional: { type: "string" },
        extra: { type: "number" },
      }),
    });
    expect(
      resolveTypeNodeSchema(
        {
          ...host,
          schemaIdAliases: { User: "UserModel" },
          openapiDefinitions: { UserModel: { type: "object" } },
        },
        parseAnnotation("User"),
      ),
    ).toEqual({ $ref: "#/components/schemas/UserModel" });
    expect(resolveTypeNodeSchema(host as never, parseAnnotation("Record<string>"))).toEqual({
      type: "object",
      additionalProperties: true,
    });
    expect(
      resolveTypeNodeSchema(
        {
          ...host,
          extractKeysFromTypeNode: () => ["id"],
        },
        t.tsMappedType(t.tsTypeParameter(t.tsLiteralType(t.stringLiteral("id")), undefined, "K")),
      ),
    ).toMatchObject({
      type: "object",
      properties: { id: { type: "object" } },
    });
    expect(
      resolveTypeNodeSchema(
        {
          ...host,
          resolveImportPath: () => "/virtual/imported.ts",
          typeDefinitions: { User: { type: "object" } },
          resolveType: () => ({ type: "string" }),
        },
        parseAnnotation("import('mod').User"),
      ),
    ).toEqual({ type: "string" });
    expect(
      resolveTypeNodeSchema(host as never, parseAnnotation("{ [key: string] }")),
    ).toMatchObject({
      additionalProperties: true,
    });
    expect(
      resolveTypeNodeSchema(
        host as never,
        t.tsTypeLiteral([
          t.tsPropertySignature(t.numericLiteral(1), t.tsTypeAnnotation(t.tsStringKeyword())),
        ]),
      ),
    ).toEqual({ type: "object", properties: {} });
    expect(resolveTypeNodeSchema(host as never, parseAnnotation('"a" | null'))).toMatchObject({
      type: "string",
      enum: ["a"],
      nullable: true,
    });
    expect(
      resolveTypeNodeSchema(host as never, parseAnnotation("{ id: string } & { name: string }")),
    ).toMatchObject({
      type: "object",
      required: ["id", "name"],
    });
    expect(resolveTypeNodeSchema(host as never, t.tsThisType())).toEqual({ type: "object" });
  });
});
