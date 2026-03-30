import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import * as t from "@babel/types";
import { afterEach, describe, expect, it } from "vitest";

import { ZodSchemaConverter } from "@workspace/openapi-core/schema/zod/zod-converter.js";
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

describe("ZodSchemaConverter helper seams", () => {
  const roots: string[] = [];

  afterEach(() => {
    roots.splice(0).forEach((root) => fs.rmSync(root, { recursive: true, force: true }));
  });

  it("uses injected file access while resolving imports and cached parses", () => {
    const filePath = "/virtual/schema.ts";
    const converter = new ZodSchemaConverter("/virtual", undefined, {
      existsSync: (target) =>
        target === filePath || target === "/virtual" || target === "/virtual/factory.ts",
      readdirSync: () => ["schema.ts"],
      statSync: () =>
        ({
          isDirectory: () => false,
        }) as fs.Stats,
      readFileSync: (target) => {
        if (target === filePath) {
          return 'import { z } from "zod"; export const UserSchema = z.object({ id: z.string() });';
        }
        return "";
      },
    });

    expect(converter.parseFileWithCache(filePath)).toBeTruthy();
    expect(converter.parseFileWithCache(filePath)).toBeTruthy();
    expect(converter.resolveImportPath("/virtual/schema.ts", "./factory")).toBe(
      "/virtual/factory.ts",
    );
  });

  it("expands imported factory functions and helper branches", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-zod-converter-seams-"));
    roots.push(root);

    fs.writeFileSync(
      path.join(root, "factory.ts"),
      [
        'import { z } from "zod";',
        "export function makeWrappedSchema(itemSchema: any) {",
        "  if (itemSchema) {",
        "    return z.object({ item: itemSchema });",
        "  }",
        "  return z.object({ empty: z.boolean() });",
        "}",
      ].join("\n"),
    );
    const schemaFile = path.join(root, "schemas.ts");
    fs.writeFileSync(
      schemaFile,
      [
        'import { z } from "zod";',
        'import { makeWrappedSchema } from "./factory";',
        "export const WrappedSchema = makeWrappedSchema(z.string());",
      ].join("\n"),
    );

    const converter = new ZodSchemaConverter(root);
    converter.processFileForZodSchema(schemaFile, "WrappedSchema");

    expect(converter.zodSchemas.WrappedSchema).toEqual({
      type: "object",
      properties: {
        item: {
          type: "string",
        },
      },
      required: ["item"],
    });
    expect(
      converter.findFactoryFunction("missingFactory", schemaFile, parseTypeScriptFile(""), {}),
    ).toBe(null);
  });

  it("covers low-level return extraction and parameter substitution helpers", () => {
    const converter = new ZodSchemaConverter(process.cwd());
    const ast = parseTypeScriptFile(`
      const direct = () => z.string();
      function conditional(flag: boolean) {
        if (flag) {
          return z.number();
        }
        return z.boolean();
      }
    `);
    const [directDecl, conditionalDecl] = ast.program.body;

    if (!directDecl || !t.isVariableDeclaration(directDecl) || !conditionalDecl) {
      throw new Error("Expected declarations");
    }

    const directFn = directDecl.declarations[0]?.init;
    if (!directFn || !t.isArrowFunctionExpression(directFn)) {
      throw new Error("Expected direct arrow function");
    }

    expect(converter.returnsZodSchema(directFn)).toBe(true);
    expect(converter.returnsZodSchema(conditionalDecl)).toBe(true);
    expect(converter.returnsZodSchema(t.identifier("noop"))).toBe(false);
    expect(converter.extractReturnNode(directFn)).toBeTruthy();
    expect(converter.extractReturnNode(conditionalDecl)).toBeTruthy();

    const substituted = converter.substituteParameters(
      getFirstInitializer("makeWrappedSchema({ ...input, list: [input, ...items] })"),
      new Map<string, t.Node>([
        ["input", t.identifier("UserSchema")],
        ["items", t.arrayExpression([t.identifier("AuditSchema")])],
      ]),
      process.cwd(),
    );
    expect(t.isCallExpression(substituted)).toBe(true);
  });

  it("covers parser failure and schema-detection helpers", () => {
    const brokenConverter = new ZodSchemaConverter("/virtual", undefined, {
      existsSync: () => false,
      readdirSync: () => [],
      statSync: () =>
        ({
          isDirectory: () => false,
        }) as fs.Stats,
      readFileSync: () => {
        throw new Error("boom");
      },
    });
    expect(brokenConverter.parseFileWithCache("/virtual/schema.ts")).toBeNull();

    const converter = new ZodSchemaConverter(process.cwd());
    converter.drizzleZodImports.add("createInsertSchema");

    expect(converter.isZodSchema(getFirstInitializer("z.string()"))).toBe(true);
    expect(converter.isZodSchema(getFirstInitializer("z.string().optional()"))).toBe(true);
    expect(converter.isZodSchema(getFirstInitializer("createInsertSchema(table)"))).toBe(true);
    expect(converter.isZodSchema(getFirstInitializer("createSchema(table)"))).toBe(false);
  });

  it("supports multiple schema directories and chained base-schema transforms", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-zod-converter-multi-"));
    roots.push(root);

    const firstDir = path.join(root, "first");
    const secondDir = path.join(root, "second");
    fs.mkdirSync(firstDir, { recursive: true });
    fs.mkdirSync(secondDir, { recursive: true });
    fs.writeFileSync(
      path.join(secondDir, "schemas.ts"),
      [
        'import { z } from "zod";',
        "const BaseSchema = z.object({ id: z.string(), count: z.number() });",
        "export const PickedSchema = BaseSchema.pick({ id: true });",
        "export const OmittedSchema = BaseSchema.omit({ count: true });",
        "export const PartialSchema = BaseSchema.partial();",
        "export const RequiredSchema = BaseSchema.partial().required();",
      ].join("\n"),
    );

    const converter = new ZodSchemaConverter([firstDir, secondDir]);

    expect(converter.convertZodSchemaToOpenApi("PickedSchema")).toEqual({
      type: "object",
      properties: {
        id: {
          type: "string",
        },
      },
      required: ["id"],
    });
    expect(converter.convertZodSchemaToOpenApi("OmittedSchema")).toEqual({
      type: "object",
      properties: {
        id: {
          type: "string",
        },
      },
      required: ["id"],
    });
    expect(converter.convertZodSchemaToOpenApi("PartialSchema")).toEqual({
      type: "object",
      properties: {
        id: {
          type: "string",
        },
        count: {
          type: "number",
        },
      },
    });
    expect(converter.convertZodSchemaToOpenApi("RequiredSchema")).toEqual({
      type: "object",
      properties: {
        id: {
          type: "string",
        },
        count: {
          type: "number",
        },
      },
      required: ["id", "count"],
    });
  });

  it("covers lazy and literal helper branches without file scanning", () => {
    const converter = new ZodSchemaConverter(process.cwd());
    converter.zodSchemas.UserSchema = {
      type: "object",
      properties: {
        id: { type: "string" },
      },
      required: ["id"],
    };

    expect(
      converter.processZodLazy(getFirstInitializer("z.lazy(() => z.string())") as t.CallExpression),
    ).toEqual({ type: "string" });
    expect(
      converter.processZodLazy(getFirstInitializer("z.lazy(() => UserSchema)") as t.CallExpression),
    ).toEqual({ $ref: "#/components/schemas/UserSchema" });
    expect(converter.processZodLazy(getFirstInitializer("z.lazy()") as t.CallExpression)).toEqual({
      type: "object",
    });
    expect(
      converter.processZodLiteral(getFirstInitializer("z.literal()") as t.CallExpression),
    ).toEqual({
      type: "string",
    });
    expect(
      converter.processZodLiteral(getFirstInitializer("z.literal(true)") as t.CallExpression),
    ).toEqual({
      type: "boolean",
      enum: [true],
    });
  });

  it("covers discriminated union fallback branches", () => {
    const converter = new ZodSchemaConverter(process.cwd());

    expect(
      converter.processZodDiscriminatedUnion(
        getFirstInitializer("z.discriminatedUnion()") as t.CallExpression,
      ),
    ).toEqual({ type: "object" });
    expect(
      converter.processZodDiscriminatedUnion(
        getFirstInitializer('z.discriminatedUnion("kind", z.object({}))') as t.CallExpression,
      ),
    ).toEqual({ type: "object" });
    expect(
      converter.processZodDiscriminatedUnion(
        getFirstInitializer('z.discriminatedUnion("kind", [])') as t.CallExpression,
      ),
    ).toEqual({ type: "object" });
  });

  it("covers union helper branches", () => {
    const converter = new ZodSchemaConverter(process.cwd());

    expect(
      converter.processZodUnion(
        getFirstInitializer("z.union([z.string(), z.null()])") as t.CallExpression,
      ),
    ).toEqual({
      type: "string",
      nullable: true,
    });
    expect(
      converter.processZodUnion(
        getFirstInitializer('z.union([z.literal("a"), z.literal("b")])') as t.CallExpression,
      ),
    ).toEqual({
      type: "string",
      enum: ["a", "b"],
    });
    expect(
      converter.processZodUnion(getFirstInitializer("z.union(z.string())") as t.CallExpression),
    ).toEqual({
      type: "object",
    });
  });

  it("covers object and primitive helper fallbacks", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-zod-converter-primitives-"));
    roots.push(root);
    const converter = new ZodSchemaConverter(root);
    converter.drizzleZodImports.add("createInsertSchema");

    expect(
      converter.processZodObject(getFirstInitializer("z.object()") as t.CallExpression),
    ).toEqual({
      type: "object",
    });
    expect(
      converter.processZodPrimitive(
        getFirstInitializer('z.custom().describe("Documented")') as t.CallExpression,
      ),
    ).toEqual({
      type: "string",
      description: "Documented",
    });
    expect(
      (converter as any).processZodPrimitive(getFirstInitializer("z.bigint()") as t.CallExpression),
    ).toEqual({
      type: "integer",
      format: "int64",
    });
    expect(
      (converter as any).processZodPrimitive(
        getFirstInitializer('z.enum(["a", "b"])') as t.CallExpression,
      ),
    ).toEqual({
      type: "string",
      enum: ["a", "b"],
    });
    expect(
      (converter as any).processZodPrimitive(
        getFirstInitializer('z.enum({ A: "a", B: "b" })') as t.CallExpression,
      ),
    ).toEqual({
      type: "string",
      enum: ["a", "b"],
    });
    expect(
      (converter as any).processZodPrimitive(
        getFirstInitializer("z.record(z.number())") as t.CallExpression,
      ),
    ).toEqual({
      type: "object",
      additionalProperties: { type: "number" },
    });
    expect(
      (converter as any).processZodPrimitive(getFirstInitializer("z.any()") as t.CallExpression),
    ).toEqual({});
    expect(
      (converter as any).processZodPrimitive(getFirstInitializer("z.enum({})") as t.CallExpression),
    ).toEqual({
      type: "string",
    });
    expect(
      (converter as any).processZodPrimitive(
        getFirstInitializer("z.custom<File>()") as t.CallExpression,
      ),
    ).toEqual({
      type: "string",
      format: "binary",
    });
    expect(
      converter.processZodNode(
        getFirstInitializer(
          `createInsertSchema(table, {
            email: (schema) => schema.email.min(3),
            isActive: (schema) => schema.isActive.optional(),
          })`,
        ),
      ),
    ).toEqual({
      type: "object",
      properties: {
        email: {
          type: "string",
          format: "email",
          minLength: 3,
        },
        isActive: {
          type: "boolean",
        },
      },
      required: ["email"],
    });
    expect(
      converter.processZodTuple(
        getFirstInitializer("z.tuple([z.string(), z.number()])") as t.CallExpression,
      ),
    ).toEqual({
      type: "array",
      items: { type: "string" },
    });
    expect(converter.processZodTuple(getFirstInitializer("z.tuple()") as t.CallExpression)).toEqual(
      {
        type: "array",
        items: { type: "string" },
      },
    );
    expect(
      converter.processZodIntersection(
        getFirstInitializer(
          "z.intersection(z.object({ a: z.string() }), z.object({ b: z.number() }))",
        ) as t.CallExpression,
      ),
    ).toEqual({
      allOf: [
        {
          type: "object",
          properties: {
            a: { type: "string" },
          },
          required: ["a"],
        },
        {
          type: "object",
          properties: {
            b: { type: "number" },
          },
          required: ["b"],
        },
      ],
    });
    expect(
      converter.processZodIntersection(getFirstInitializer("z.intersection()") as t.CallExpression),
    ).toEqual({
      type: "object",
    });
  });

  it("covers processZodNode references and object-property variants", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-zod-converter-refs-"));
    roots.push(root);
    const converter = new ZodSchemaConverter(root);
    converter.zodSchemas.BaseSchema = {
      type: "object",
      properties: {
        id: { type: "string" },
      },
      required: ["id"],
    };
    converter.zodSchemas.UserSchema = {
      type: "object",
      properties: {
        id: { type: "string" },
      },
      required: ["id"],
    };
    converter.zodSchemas.PaymentMethodSchema = {
      type: "object",
      properties: {
        label: { type: "string" },
      },
      required: ["label"],
    };
    converter.zodSchemas.ArraySchema = {
      type: "array",
      items: { type: "string" },
    };
    converter.zodSchemas.NumberSchema = {
      type: "number",
    };

    expect(converter.processZodNode(getFirstInitializer("BaseSchema.describe('Base')"))).toEqual({
      allOf: [{ $ref: "#/components/schemas/BaseSchema" }],
      description: "Base",
    });
    expect(converter.processZodNode(getFirstInitializer("BaseSchema.optional()"))).toEqual({
      allOf: [{ $ref: "#/components/schemas/BaseSchema" }],
    });
    expect(converter.processZodNode(getFirstInitializer("z.coerce.number()"))).toEqual({
      type: "number",
    });
    expect(converter.processZodNode(t.identifier("UnknownSchema"))).toEqual({
      $ref: "#/components/schemas/UnknownSchema",
    });
    expect(
      converter.processZodObject(
        getFirstInitializer(
          `z.object({
            user: UserSchema.describe("User ref"),
            alias: UserSchema,
            methods: z.array(PaymentMethodSchema),
          })`,
        ) as t.CallExpression,
      ),
    ).toEqual({
      type: "object",
      properties: {
        user: {
          allOf: [{ $ref: "#/components/schemas/UserSchema" }],
          description: "User ref",
        },
        alias: {
          $ref: "#/components/schemas/UserSchema",
        },
        methods: {
          type: "array",
          items: { $ref: "#/components/schemas/PaymentMethodSchema" },
        },
      },
      required: ["user", "alias", "methods"],
    });
    expect(
      converter.processZodObject(
        getFirstInitializer(
          `z.object({
            described: UserSchema.describe(),
            optionalMethods: z.array(PaymentMethodSchema).optional(),
            plain: z.string(),
          })`,
        ) as t.CallExpression,
      ),
    ).toEqual({
      type: "object",
      properties: {
        described: {
          $ref: "#/components/schemas/UserSchema",
        },
        optionalMethods: {
          type: "array",
          items: { $ref: "#/components/schemas/PaymentMethodSchema" },
        },
        plain: {
          type: "string",
        },
      },
      required: ["described", "plain"],
    });
  });

  it("covers optionality and description extraction helpers", () => {
    const converter = new ZodSchemaConverter(process.cwd());

    expect(
      converter.isOptional(getFirstInitializer("z.string().optional()") as t.CallExpression),
    ).toBe(true);
    expect(
      converter.hasOptionalMethod(
        getFirstInitializer("z.string().nullable().optional()") as t.CallExpression,
      ),
    ).toBe(true);
    expect(
      converter.extractDescriptionFromArguments(
        getFirstInitializer('z.string().describe("Documented")') as t.CallExpression,
      ),
    ).toBe("Documented");
  });

  it("covers chained method transforms", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-zod-converter-chain-"));
    roots.push(root);
    const converter = new ZodSchemaConverter(root);
    converter.zodSchemas.BaseSchema = {
      type: "object",
      properties: {
        id: { type: "string" },
      },
      required: ["id"],
      description: "Base schema",
    };
    converter.zodSchemas.NumberSchema = { type: "number" };
    converter.zodSchemas.ArraySchema = { type: "array", items: { type: "string" } };

    expect(
      converter.processZodChain(getFirstInitializer("z.string().describe('@deprecated Old')")),
    ).toEqual({
      type: "string",
      deprecated: true,
      description: "Old",
    });
    expect(converter.processZodChain(getFirstInitializer("z.string().deprecated()"))).toEqual({
      type: "string",
      deprecated: true,
    });
    expect(
      converter.processZodChain(getFirstInitializer("z.string().min(2).max(4).length(3)")),
    ).toEqual({
      type: "string",
      minLength: 3,
      maxLength: 3,
    });
    expect(converter.processZodChain(getFirstInitializer("z.number().min(2).max(4)"))).toEqual({
      type: "number",
      minimum: 2,
      maximum: 4,
    });
    expect(
      converter.processZodChain(getFirstInitializer("z.array(z.string()).min(1).max(2).length(2)")),
    ).toEqual({
      type: "array",
      items: { type: "string" },
      minItems: 2,
      maxItems: 2,
    });
    expect(
      converter.processZodChain(
        getFirstInitializer("z.string().regex(/abc/).startsWith('a').endsWith('z').includes('b')"),
      ),
    ).toEqual({
      type: "string",
      pattern: "b",
    });
    expect(converter.processZodChain(getFirstInitializer("z.string().endsWith('z')"))).toEqual({
      type: "string",
      pattern: "z$",
    });
    expect(
      converter.processZodChain(
        getFirstInitializer("z.object({ enabled: z.boolean() }).default({ enabled: true })"),
      ),
    ).toEqual({
      type: "object",
      properties: {
        enabled: { type: "boolean" },
      },
      required: ["enabled"],
      default: {
        enabled: true,
      },
    });
    expect(
      converter.processZodChain(getFirstInitializer("BaseSchema.extend({ name: z.string() })")),
    ).toEqual({
      type: "object",
      properties: {
        id: { type: "string" },
        name: { type: "string" },
      },
      required: ["id", "name"],
      description: "Base schema",
    });
    expect(converter.processZodChain(getFirstInitializer("z.string().or(z.number())"))).toEqual({
      oneOf: [{ type: "string" }, { type: "number" }],
    });
    expect(converter.processZodChain(getFirstInitializer("z.string().and(z.number())"))).toEqual({
      allOf: [{ type: "string" }, { type: "number" }],
    });
  });

  it("covers import resolution and factory expansion fallback branches", () => {
    const converter = new ZodSchemaConverter("/virtual", undefined, {
      existsSync: (target) =>
        target === "/virtual/factory/index.ts" || target === "/virtual/already.ts",
      readdirSync: () => [],
      statSync: () =>
        ({
          isDirectory: () => false,
        }) as fs.Stats,
      readFileSync: () => "",
    });

    expect(converter.resolveImportPath("/virtual/schema.ts", "./factory")).toBe(
      "/virtual/factory/index.ts",
    );
    expect(converter.resolveImportPath("/virtual/schema.ts", "./already.ts")).toBe(
      "/virtual/already.ts",
    );
    expect(converter.resolveImportPath("/virtual/schema.ts", "zod")).toBeNull();
    expect(
      converter.expandFactoryCall(
        t.identifier("noop"),
        getFirstInitializer("factory()") as t.CallExpression,
        process.cwd(),
      ),
    ).toBeNull();

    const noReturnFunction = parseTypeScriptFile(`
      function makeSchema(input: string) {
        const value = input;
      }
    `).program.body[0];
    if (!noReturnFunction) {
      throw new Error("Expected function declaration");
    }

    expect(converter.extractReturnNode(noReturnFunction as t.Node)).toBeNull();
  });
});
