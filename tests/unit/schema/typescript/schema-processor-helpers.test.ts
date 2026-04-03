import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import * as t from "@babel/types";
import { afterEach, describe, expect, it } from "vitest";

import {
  createTypeReferenceFromString,
  parseGenericTypeString,
  SchemaProcessor,
  splitGenericTypeArguments,
} from "@workspace/openapi-core/schema/typescript/schema-processor.js";
import { parseTypeScriptFile } from "@workspace/openapi-core/shared/utils.js";

describe("SchemaProcessor helper seams", () => {
  const roots: string[] = [];

  afterEach(() => {
    roots.splice(0).forEach((root) => fs.rmSync(root, { recursive: true, force: true }));
  });

  it("parses generic helper strings without instantiating the processor", () => {
    expect(splitGenericTypeArguments("User, Paginated<Post>, Result<Comment[]>")).toEqual([
      "User",
      "Paginated<Post>",
      "Result<Comment[]>",
    ]);
    expect(parseGenericTypeString("Envelope<User, Result<Post>>")).toEqual({
      baseTypeName: "Envelope",
      typeArguments: ["User", "Result<Post>"],
    });
    expect(parseGenericTypeString("User")).toBeNull();
    expect(createTypeReferenceFromString("Envelope<User>").typeParameters.params).toHaveLength(1);
    expect(createTypeReferenceFromString("Broken<").typeName.name).toBe("Broken<");
  });

  it("supports injected file access for schema discovery", () => {
    const filePath = "/virtual/schemas.ts";
    const processor = new SchemaProcessor("/virtual", "typescript", undefined, undefined, {
      existsSync: (target) => target === "/virtual" || target === filePath,
      readdirSync: () => ["schemas.ts"],
      statSync: () =>
        ({
          isDirectory: () => false,
        }) as fs.Stats,
      readFileSync: () => "export interface VirtualUser { id: string; }",
    });

    expect(processor.findSchemaDefinition("VirtualUser", "response")).toEqual({
      type: "object",
      properties: {
        id: {
          type: "string",
        },
      },
      required: ["id"],
    });
  });

  it("covers zod-first resolution and missing fallbacks", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-schema-zod-fallback-"));
    roots.push(root);
    const processor = new SchemaProcessor(root, ["typescript", "zod"]);
    (processor as any).zodSchemaConverter = {
      typeToSchemaMapping: {
        UserFromZod: "UserSchema",
      },
      convertZodSchemaToOpenApi: () => null,
      processZodNode: () => ({ type: "object" }),
    };
    (processor as any).zodSchemaProcessor = {
      resolveSchema: (schemaName: string) =>
        schemaName === "UserFromZod"
          ? { type: "object", properties: { id: { type: "string" } } }
          : null,
    };

    expect(processor.findSchemaDefinition("UserFromZod", "response")).toEqual({
      type: "object",
      properties: {
        id: { type: "string" },
      },
    });
    expect(processor.findSchemaDefinition("DefinitelyMissing", "response")).toEqual({});
  });

  it("resolves imported utility and generic interface types", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-schema-processor-seams-"));
    roots.push(root);

    fs.writeFileSync(
      path.join(root, "helpers.ts"),
      [
        "export interface User {",
        "  id: string;",
        "}",
        "export function loadUser(): User {",
        '  return { id: "1" };',
        "}",
        "export const updateUser = (input: User): Promise<User> => Promise.resolve(input);",
      ].join("\n"),
    );
    fs.writeFileSync(
      path.join(root, "schemas.ts"),
      [
        'import { loadUser, updateUser, type User } from "./helpers";',
        "export type ImportedReturn = ReturnType<typeof loadUser>;",
        "export type ImportedFirstArg = Parameters<typeof updateUser>[0];",
        "export type ImportedArgs = Parameters<typeof updateUser>;",
        "export interface Envelope<T> {",
        "  data: T;",
        "}",
        "export type WrappedUser = Envelope<User>;",
        "export type AsyncUser = Awaited<Promise<User>>;",
        "export type UserMap = Record<string, User>;",
      ].join("\n"),
    );

    const processor = new SchemaProcessor(root, "typescript");

    expect(processor.findSchemaDefinition("ImportedReturn", "response")).toEqual({
      type: "object",
      properties: {
        id: {
          type: "string",
        },
      },
      required: ["id"],
    });
    expect(processor.findSchemaDefinition("ImportedFirstArg", "params")).toEqual({
      type: "object",
      properties: {
        id: {
          type: "string",
        },
      },
      required: ["id"],
    });
    expect(processor.findSchemaDefinition("ImportedArgs", "params")).toEqual({
      type: "array",
      prefixItems: [
        {
          type: "object",
          properties: {
            id: {
              type: "string",
            },
          },
          required: ["id"],
        },
      ],
      items: false,
      minItems: 1,
      maxItems: 1,
    });
    expect(processor.findSchemaDefinition("WrappedUser", "response")).toEqual({
      type: "object",
      properties: {
        data: {
          type: "object",
          properties: {
            id: {
              type: "string",
            },
          },
          required: ["id"],
        },
      },
      required: ["data"],
    });
    expect(processor.findSchemaDefinition("AsyncUser", "response")).toEqual({
      type: "object",
      properties: {
        id: {
          type: "string",
        },
      },
      required: ["id"],
    });
    expect(processor.findSchemaDefinition("UserMap", "response")).toEqual({
      type: "object",
      additionalProperties: {
        type: "object",
        properties: {
          id: {
            type: "string",
          },
        },
        required: ["id"],
      },
    });
  });

  it("falls back to the TypeScript checker for conditional, import, and keyof types", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-schema-processor-checker-"));
    roots.push(root);

    fs.writeFileSync(
      path.join(root, "models.ts"),
      ["export interface ImportedUser {", "  id: string;", "  active: boolean;", "}"].join("\n"),
    );
    fs.writeFileSync(
      path.join(root, "schemas.ts"),
      [
        'import type { ImportedUser } from "./models";',
        "export type ConditionalResult = true extends true ? { ok: true } : never;",
        'export type ImportedViaTsImport = import("./models").ImportedUser;',
        "export type KeyUnion = keyof ImportedUser;",
      ].join("\n"),
    );

    const processor = new SchemaProcessor(root, "typescript");

    expect(processor.findSchemaDefinition("ConditionalResult", "response")).toEqual({
      type: "object",
      properties: {
        ok: { type: "boolean", enum: [true] },
      },
      required: ["ok"],
    });
    expect(processor.findSchemaDefinition("ImportedViaTsImport", "response")).toEqual({
      type: "object",
      properties: {
        id: { type: "string" },
        active: { type: "boolean" },
      },
      required: ["id", "active"],
    });
    expect(processor.findSchemaDefinition("KeyUnion", "response")).toEqual({
      type: "string",
      enum: ["id", "active"],
    });
  });

  it("covers extends, pick/omit, unions, and custom-schema priority", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-schema-processor-types-"));
    roots.push(root);

    const customSchemaFile = path.join(root, "custom.json");
    fs.writeFileSync(
      customSchemaFile,
      JSON.stringify({
        components: {
          schemas: {
            CustomFirst: {
              type: "object",
              properties: {
                source: {
                  type: "string",
                },
              },
            },
          },
        },
      }),
    );
    fs.writeFileSync(
      path.join(root, "schemas.ts"),
      [
        "export interface BaseContract {",
        "  id: string;",
        "}",
        "export interface ExtendedContract extends BaseContract {",
        "  count: number;",
        "}",
        "export interface Shape {",
        "  a: string;",
        "  b: number;",
        "}",
        "export type OnlyA = Pick<Shape, 'a'>;",
        "export type WithoutB = Omit<Shape, 'b'>;",
        "export type NullableName = string | null;",
        "export type MixedUnion = string | number;",
      ].join("\n"),
    );

    const processor = new SchemaProcessor([root, path.join(root, "missing")], "typescript", [
      customSchemaFile,
    ]);

    expect(processor.findSchemaDefinition("CustomFirst", "response")).toEqual({
      type: "object",
      properties: {
        source: {
          type: "string",
        },
      },
    });
    expect(processor.findSchemaDefinition("ExtendedContract", "response")).toEqual({
      type: "object",
      properties: {
        id: {
          type: "string",
        },
        count: {
          type: "number",
        },
      },
      required: ["count"],
    });
    expect(processor.findSchemaDefinition("OnlyA", "response")).toEqual({
      type: "object",
      properties: {
        a: {
          type: "string",
        },
      },
    });
    expect(processor.findSchemaDefinition("WithoutB", "response")).toEqual({
      type: "object",
      properties: {
        a: {
          type: "string",
        },
      },
    });
    expect(processor.findSchemaDefinition("NullableName", "response")).toEqual({
      type: "string",
      nullable: true,
    });
    expect(processor.findSchemaDefinition("MixedUnion", "response")).toEqual({
      oneOf: [{ type: "string" }, { type: "number" }],
    });
  });

  it("covers arrow-function helper extraction branches", () => {
    const processor = new SchemaProcessor(process.cwd(), "typescript");
    const ast = parseTypeScriptFile("const makeValue = (input: string): number => input.length;");
    const declaration = ast.program.body[0];

    if (!declaration || !t.isVariableDeclaration(declaration)) {
      throw new Error("Expected variable declaration");
    }

    const variable = declaration.declarations[0];
    const arrow = variable?.init;
    if (!arrow || !t.isArrowFunctionExpression(arrow) || !variable) {
      throw new Error("Expected arrow function");
    }

    expect(t.isTSNumberKeyword((processor as any).extractFunctionReturnType(arrow))).toBe(true);
    expect((processor as any).extractFunctionParameters(arrow)).toHaveLength(1);
    expect((processor as any).extractFunctionReturnType(variable)).toBeDefined();
    expect((processor as any).extractFunctionParameters(variable)).toHaveLength(1);
  });

  it("covers direct TypeScript node resolution helpers", () => {
    const processor = new SchemaProcessor(process.cwd(), "typescript");
    (processor as any).openapiDefinitions.User = {
      type: "object",
      properties: {
        id: { type: "string" },
      },
    };
    (processor as any).findSchemaDefinition = (name: string) =>
      (processor as any).openapiDefinitions[name] || {};

    expect((processor as any).resolveTSNodeType(t.tsLiteralType(t.numericLiteral(1)))).toEqual({
      type: "number",
      enum: [1],
    });
    expect((processor as any).resolveTSNodeType(t.tsLiteralType(t.booleanLiteral(true)))).toEqual({
      type: "boolean",
      enum: [true],
    });
    expect(
      (processor as any).resolveTSNodeType(
        t.tsExpressionWithTypeArguments(t.identifier("User"), undefined),
      ),
    ).toEqual({});
    expect(
      (processor as any).resolveTSNodeType(
        t.tsIndexedAccessType(
          t.tsTypeReference(t.identifier("ImportedArgs")),
          t.tsLiteralType(t.numericLiteral(0)),
        ),
      ),
    ).toEqual({
      type: "object",
    });
    expect(
      (processor as any).resolveTSNodeType(
        t.tsIndexedAccessType(
          t.tsTypeLiteral([
            t.tsPropertySignature(t.identifier("slug"), t.tsTypeAnnotation(t.tsStringKeyword())),
          ]),
          t.tsLiteralType(t.stringLiteral("slug")),
        ),
      ),
    ).toEqual({
      type: "string",
    });
    expect((processor as any).resolveTSNodeType(t.tsTypeReference(t.identifier("Date")))).toEqual({
      type: "string",
      format: "date-time",
    });
    expect(
      (processor as any).resolveTSNodeType(
        t.tsTypeReference(
          t.identifier("Promise"),
          t.tsTypeParameterInstantiation([t.tsStringKeyword()]),
        ),
      ),
    ).toEqual({
      type: "string",
    });
    expect(
      (processor as any).resolveTSNodeType(
        t.tsTypeReference(
          t.identifier("Array"),
          t.tsTypeParameterInstantiation([t.tsNumberKeyword()]),
        ),
      ),
    ).toEqual({
      type: "array",
      items: { type: "number" },
    });
    expect(
      (processor as any).resolveTSNodeType(
        t.tsTypeReference(
          t.identifier("Record"),
          t.tsTypeParameterInstantiation([t.tsStringKeyword(), t.tsBooleanKeyword()]),
        ),
      ),
    ).toEqual({
      type: "object",
      additionalProperties: { type: "boolean" },
    });
    expect(
      (processor as any).resolveTSNodeType(
        t.tsTypeReference(
          t.identifier("Awaited"),
          t.tsTypeParameterInstantiation([t.tsTypeReference(t.identifier("User"))]),
        ),
      ),
    ).toEqual({});
    expect((processor as any).resolveTSNodeType(t.tsArrayType(t.tsBooleanKeyword()))).toEqual({
      type: "array",
      items: { type: "boolean" },
    });
    expect(
      (processor as any).resolveTSNodeType(
        t.tsTypeLiteral([
          t.tsPropertySignature(t.identifier("enabled"), t.tsTypeAnnotation(t.tsBooleanKeyword())),
        ]),
      ),
    ).toEqual({
      type: "object",
      properties: {
        enabled: { type: "boolean" },
      },
      required: ["enabled"],
    });
    expect(
      (processor as any).resolveTSNodeType(
        t.tsUnionType([
          t.tsLiteralType(t.stringLiteral("a")),
          t.tsLiteralType(t.numericLiteral(1)),
        ]),
      ),
    ).toEqual({
      oneOf: [
        { type: "string", enum: ["a"] },
        { type: "number", enum: [1] },
      ],
    });
  });

  it("covers enum, property option, and schema file fallback branches", () => {
    const processor = new SchemaProcessor("/virtual", "typescript", undefined, undefined, {
      existsSync: () => true,
      readdirSync: () => ["broken.ts"],
      statSync: () =>
        ({
          isDirectory: () => false,
        }) as fs.Stats,
      readFileSync: () => {
        throw "broken schema";
      },
    });

    expect(processor.findSchemaDefinition("Broken", "body")).toEqual({});
    expect(
      (processor as any).processEnum(
        t.tsEnumDeclaration(t.identifier("Status"), [
          t.tsEnumMember(t.identifier("Active"), t.stringLiteral("active")),
          t.tsEnumMember(t.identifier("Pending"), t.numericLiteral(1)),
        ]),
      ),
    ).toEqual({
      type: "number",
      enum: ["active", 1],
    });

    const property = t.tsPropertySignature(
      t.identifier("label"),
      t.tsTypeAnnotation(t.tsStringKeyword()),
    );
    property.optional = true;
    property.trailingComments = [{ type: "CommentLine", value: " display name" }] as never;
    (processor as any).contentType = "body";
    expect((processor as any).getPropertyOptions(property)).toEqual({
      description: "display name",
      nullable: true,
    });
    expect(
      (processor as any).extractKeysFromLiteralType(t.tsLiteralType(t.stringLiteral("slug"))),
    ).toEqual(["slug"]);
    expect(
      (processor as any).extractKeysFromLiteralType(
        t.tsUnionType([
          t.tsLiteralType(t.stringLiteral("a")),
          t.tsLiteralType(t.stringLiteral("b")),
        ]),
      ),
    ).toEqual(["a", "b"]);
  });

  it("covers generic substitution and fallback branches", () => {
    const processor = new SchemaProcessor(process.cwd(), "typescript");
    (processor as any).openapiDefinitions.User = {
      type: "object",
      properties: {
        id: { type: "string" },
      },
    };
    (processor as any).findSchemaDefinition = (name: string) => {
      if (name === "MissingResolved") {
        (processor as any).openapiDefinitions.MissingResolved = {
          type: "object",
          properties: {
            value: { type: "number" },
          },
        };
      }
      return (processor as any).openapiDefinitions[name] || {};
    };

    expect(
      (processor as any).resolveTypeWithSubstitution(t.tsTypeReference(t.identifier("T")), {
        T: t.tsTypeReference(t.identifier("User")),
      }),
    ).toEqual({
      type: "object",
      properties: {
        id: { type: "string" },
      },
    });
    expect(
      (processor as any).resolveTypeWithSubstitution(t.tsTypeReference(t.identifier("T")), {
        T: t.tsTypeReference(t.identifier("MissingResolved")),
      }),
    ).toEqual({
      type: "object",
      properties: {
        value: { type: "number" },
      },
    });
    expect(
      (processor as any).resolveTypeWithSubstitution(
        t.tsIntersectionType([
          t.tsTypeReference(t.identifier("T")),
          t.tsTypeLiteral([
            t.tsPropertySignature(t.identifier("name"), t.tsTypeAnnotation(t.tsStringKeyword())),
          ]),
        ]),
        { T: t.tsTypeLiteral([]) },
      ),
    ).toEqual({
      type: "object",
      properties: {
        name: { type: "string" },
      },
      required: ["name"],
    });
    expect((processor as any).resolveGenericType(t.identifier("Nope"), [], "Nope")).toEqual({});
  });

  it("covers import resolution, date helpers, and built-in type fallbacks", () => {
    const processor = new SchemaProcessor("/virtual", "typescript", undefined, undefined, {
      existsSync: (target) => target === "/virtual/widget.tsx" || target === "/virtual/already.ts",
      readdirSync: () => [],
      statSync: () =>
        ({
          isDirectory: () => false,
        }) as fs.Stats,
      readFileSync: () => "",
    });

    expect((processor as any).resolveImportPath("./widget", "/virtual/schema.ts")).toBe(
      "/virtual/widget.tsx",
    );
    expect((processor as any).resolveImportPath("./already.ts", "/virtual/schema.ts")).toBe(
      "/virtual/already.ts",
    );
    expect((processor as any).resolveImportPath("zod", "/virtual/schema.ts")).toBeNull();

    expect((processor as any).isDateString(t.stringLiteral("2026-03-27T10:00:00Z"))).toBe(true);
    expect((processor as any).isDateObject(t.newExpression(t.identifier("Date"), []))).toBe(true);
    expect((processor as any).isDateNode(t.stringLiteral("not-a-date"))).toBe(false);

    expect(
      (processor as any).resolveTSNodeType(t.tsTypeReference(t.identifier("Promise"))),
    ).toEqual({
      type: "object",
    });
    expect((processor as any).resolveTSNodeType(t.tsTypeReference(t.identifier("Array")))).toEqual({
      type: "array",
      items: { type: "object" },
    });
    expect(
      (processor as any).resolveTSNodeType(t.tsTypeReference(t.identifier("ReadonlyArray"))),
    ).toEqual({
      type: "array",
      items: { type: "object" },
    });
    expect((processor as any).resolveTSNodeType(t.tsTypeReference(t.identifier("Record")))).toEqual(
      {
        type: "object",
        additionalProperties: true,
      },
    );
    expect(
      (processor as any).resolveTSNodeType(
        t.tsTypeReference(
          t.identifier("Partial"),
          t.tsTypeParameterInstantiation([t.tsStringKeyword()]),
        ),
      ),
    ).toEqual({
      type: "string",
    });
    expect(
      (processor as any).resolveTSNodeType(
        t.tsUnionType([
          t.tsLiteralType(t.stringLiteral("a")),
          t.tsLiteralType(t.stringLiteral("b")),
        ]),
      ),
    ).toEqual({
      type: "string",
      enum: ["a", "b"],
    });
    (processor as any).openapiDefinitions.Tupled = {
      prefixItems: [{ type: "string" }],
    };
    (processor as any).openapiDefinitions.Listed = {
      type: "array",
      items: { type: "number" },
    };
    (processor as any).findSchemaDefinition = (name: string) =>
      (processor as any).openapiDefinitions[name] || {};
    expect(
      (processor as any).resolveTSNodeType(
        t.tsIndexedAccessType(
          t.tsTypeReference(t.identifier("Tupled")),
          t.tsLiteralType(t.numericLiteral(2)),
        ),
      ),
    ).toEqual({
      type: "object",
    });
    expect(
      (processor as any).resolveTSNodeType(
        t.tsIndexedAccessType(
          t.tsTypeReference(t.identifier("Listed")),
          t.tsLiteralType(t.numericLiteral(0)),
        ),
      ),
    ).toEqual({
      type: "object",
    });
    expect((processor as any).resolveTSNodeType(t.identifier("mystery"))).toEqual({
      type: "object",
    });
    expect((processor as any).detectContentType("MultipartFormData")).toBe("multipart/form-data");
    expect((processor as any).detectContentType("UserBody")).toBe("application/json");
    expect((processor as any).getExampleForParam("enabled", "boolean")).toBe(true);
    expect((processor as any).getExampleForParam("count", "number")).toBe(1);
    expect((processor as any).getExampleForParam("slug", "string")).toBe("slug");
    expect(
      (processor as any).createFormDataSchema({
        properties: {
          avatar: {
            type: "string",
            description: "profile file",
          },
          note: {
            type: "string",
          },
        },
      }),
    ).toEqual({
      properties: {
        avatar: {
          description: "profile file",
          type: "string",
        },
        note: {
          type: "string",
        },
      },
    });
  });

  it("covers generic helper name checks and parse fallbacks", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-schema-generic-fallback-"));
    roots.push(root);
    const processor = new SchemaProcessor(root, "typescript");

    expect((processor as any).resolveGenericTypeFromString("NotGeneric")).toEqual({});
    expect((processor as any).resolveGenericTypeFromString("Missing<Base>")).toEqual({});
    expect((processor as any).isGenericTypeParameter("T")).toBe(true);
    expect((processor as any).isGenericTypeParameter("User")).toBe(false);
    expect((processor as any).isInvalidSchemaName("Bad Name")).toBe(true);
    expect((processor as any).isInvalidSchemaName("GoodName")).toBe(false);
    expect((processor as any).isBuiltInUtilityType("Awaited")).toBe(true);
    expect((processor as any).isBuiltInUtilityType("CustomType")).toBe(false);
    (processor as any).typeDefinitions.Handler = {
      node: t.arrowFunctionExpression([], t.blockStatement([])),
    };
    expect((processor as any).isFunctionSchema("Handler")).toBe(true);
    expect((processor as any).isFunctionSchema("User")).toBe(false);
  });
});
