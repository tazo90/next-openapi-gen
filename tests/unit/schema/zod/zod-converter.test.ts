import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import * as t from "@babel/types";
import { afterEach, describe, expect, it } from "vitest";

import { parseTypeScriptFile } from "@workspace/openapi-core/shared/utils.js";
import { ZodSchemaConverter } from "@workspace/openapi-core/schema/zod/zod-converter.js";

function parseInitializer(expression: string): t.Expression {
  const ast = parseTypeScriptFile(`const schema = ${expression};`);
  const statement = ast.program.body[0];

  if (!statement || !t.isVariableDeclaration(statement)) {
    throw new Error("Expected a variable declaration");
  }

  const declaration = statement.declarations[0];
  if (!declaration?.init) {
    throw new Error("Expected an initializer");
  }

  return declaration.init;
}

describe("ZodSchemaConverter", () => {
  const roots: string[] = [];

  afterEach(() => {
    roots.splice(0).forEach((root) => fs.rmSync(root, { recursive: true, force: true }));
  });

  it("finds route files recursively and processes all exported schemas in a file", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-zod-converter-files-"));
    roots.push(root);

    const nestedDir = path.join(root, "api", "users");
    fs.mkdirSync(nestedDir, { recursive: true });
    fs.writeFileSync(path.join(root, "api", "route.ts"), "");
    fs.writeFileSync(path.join(nestedDir, "user-api.ts"), "");
    fs.writeFileSync(path.join(nestedDir, "ignore.txt"), "");

    const converter = new ZodSchemaConverter(root);
    const routeFiles: string[] = [];
    converter.findRouteFilesInDir(root, routeFiles);

    expect(routeFiles.sort()).toEqual(
      [path.join(root, "api", "route.ts"), path.join(nestedDir, "user-api.ts")].sort(),
    );

    const schemaFile = path.join(root, "schemas.ts");
    fs.writeFileSync(
      schemaFile,
      ['import { z } from "zod";', "export const UserSchema = z.object({ id: z.string() });"].join(
        "\n",
      ),
    );

    converter.processAllSchemasInFile(schemaFile);
    expect(converter.zodSchemas.UserSchema).toEqual({
      type: "object",
      properties: {
        id: {
          type: "string",
        },
      },
      required: ["id"],
    });
  });

  it("reuses cached schemas and returns refs for circular processing", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-zod-converter-cache-"));
    roots.push(root);

    const converter = new ZodSchemaConverter(root);
    converter.typeToSchemaMapping = { Seed: "Seed" };
    converter.zodSchemas.UserSchema = { type: "object" };

    expect(converter.convertZodSchemaToOpenApi("UserSchema")).toEqual({ type: "object" });

    converter.processingSchemas.add("LoopSchema");
    expect(converter.convertZodSchemaToOpenApi("LoopSchema")).toEqual({
      $ref: "#/components/schemas/LoopSchema",
    });
  });

  it("converts primitive, collection, and custom Zod nodes", () => {
    const converter = new ZodSchemaConverter(process.cwd());

    expect(converter.processZodNode(parseInitializer("z.coerce.number()"))).toEqual({
      type: "number",
    });
    expect(converter.processZodNode(parseInitializer("z.bigint()"))).toEqual({
      type: "integer",
      format: "int64",
    });
    expect(converter.processZodNode(parseInitializer('z.enum({ A: "a", B: "b" })'))).toEqual({
      type: "string",
      enum: ["a", "b"],
    });
    expect(converter.processZodNode(parseInitializer("z.record(z.number())"))).toEqual({
      type: "object",
      additionalProperties: { type: "number" },
    });
    expect(converter.processZodNode(parseInitializer("z.map(z.string(), z.number())"))).toEqual({
      type: "object",
      additionalProperties: { type: "number" },
      propertyNames: { type: "string" },
    });
    expect(converter.processZodNode(parseInitializer("z.set(z.string())"))).toEqual({
      type: "array",
      items: { type: "string" },
      uniqueItems: true,
    });
    expect(converter.processZodNode(parseInitializer("z.custom<File>()"))).toEqual({
      type: "string",
      format: "binary",
    });
    expect(converter.processZodNode(parseInitializer("z.custom<Blob>()"))).toEqual({
      type: "string",
      format: "binary",
    });
    expect(converter.processZodNode(parseInitializer("z.custom<Buffer>()"))).toEqual({
      type: "string",
      format: "binary",
    });
    expect(converter.processZodNode(parseInitializer("z.custom<Uint8Array>()"))).toEqual({
      type: "string",
      format: "binary",
    });
    expect(converter.processZodNode(parseInitializer("z.custom(() => true)"))).toEqual({
      type: "object",
      additionalProperties: true,
    });
    expect(
      converter.processZodNode(
        parseInitializer('z.string().meta({ example: "demo", deprecated: true })'),
      ),
    ).toEqual({
      type: "string",
      example: "demo",
      deprecated: true,
    });
  });

  it("supports Zod 4 top-level helpers and preserves the base schema through pipelines", () => {
    const converter = new ZodSchemaConverter(process.cwd());

    expect(converter.processZodNode(parseInitializer("z.email()"))).toEqual({
      type: "string",
      format: "email",
    });
    expect(converter.processZodNode(parseInitializer("z.url()"))).toEqual({
      type: "string",
      format: "uri",
    });
    expect(converter.processZodNode(parseInitializer("z.uuid()"))).toEqual({
      type: "string",
      format: "uuid",
    });
    expect(converter.processZodNode(parseInitializer("z.iso.datetime()"))).toEqual({
      type: "string",
      format: "date-time",
    });
    expect(
      converter.processZodNode(
        parseInitializer(
          "z.string().trim().pipe(z.email()).transform((value) => value.toLowerCase())",
        ),
      ),
    ).toEqual({
      type: "string",
      format: "email",
    });
    expect(
      converter.processZodNode(
        parseInitializer(
          'z.string().trim().transform((value) => value || "/").refine((value) => value.startsWith("/")).brand<"SafeRedirectPath">()',
        ),
      ),
    ).toEqual({
      type: "string",
    });
  });

  it("creates separate request and response variants for runtime-assisted zod schemas", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-zod-runtime-variants-"));
    roots.push(root);

    fs.writeFileSync(
      path.join(root, "schemas.ts"),
      [
        'import { z } from "zod";',
        "export const QuantitySchema = z.coerce.number().pipe(z.number().min(1));",
      ].join("\n"),
    );

    const converter = new ZodSchemaConverter(root);

    expect(converter.convertZodSchemaToOpenApi("QuantitySchema", "response")).toEqual({
      type: "number",
      minimum: 1,
    });
    expect(converter.convertZodSchemaToOpenApi("QuantitySchema", "body")).toEqual({
      type: "number",
    });
    expect(converter.getSchemaReferenceName("QuantitySchema", "body")).toBe("QuantitySchema");
    expect(converter.getSchemaReferenceName("QuantitySchema", "response")).toBe(
      "QuantitySchemaOutput",
    );
    expect(converter.getProcessedSchemas()).toEqual(
      expect.objectContaining({
        QuantitySchema: { type: "number" },
        QuantitySchemaOutput: { type: "number", minimum: 1 },
      }),
    );
  });

  it("applies reference descriptions", () => {
    const converter = new ZodSchemaConverter(process.cwd());
    converter.zodSchemas.UserSchema = {
      type: "object",
      properties: {
        id: { type: "string" },
      },
      required: ["id"],
    };

    expect(converter.processZodNode(parseInitializer('UserSchema.describe("User ref")'))).toEqual({
      allOf: [{ $ref: "#/components/schemas/UserSchema" }],
      description: "User ref",
    });
  });

  it("applies chained string and number modifiers", () => {
    const converter = new ZodSchemaConverter(process.cwd());

    expect(
      converter.processZodNode(
        parseInitializer(
          'z.string().nullable().describe("@deprecated Old user").startsWith("ab").endsWith("cd").includes("ef").default("guest")',
        ),
      ),
    ).toEqual({
      type: "string",
      nullable: true,
      deprecated: true,
      description: "Old user",
      pattern: "ef",
      default: "guest",
    });

    expect(converter.processZodNode(parseInitializer('z.string().endsWith("cd")'))).toEqual({
      type: "string",
      pattern: "cd$",
    });

    expect(
      converter.processZodNode(parseInitializer("z.number().int().positive().safe()")),
    ).toEqual({
      type: "integer",
      minimum: -9007199254740991,
      exclusiveMinimum: 0,
      maximum: 9007199254740991,
    });
  });

  it("extracts descriptions, optionality, and processed schema maps", () => {
    const converter = new ZodSchemaConverter(process.cwd());
    const described = parseInitializer('z.string().describe("Human readable")');
    const optional = parseInitializer("z.string().optional()");
    const nullish = parseInitializer("z.string().nullable().nullish()");

    if (
      !t.isCallExpression(described) ||
      !t.isCallExpression(optional) ||
      !t.isCallExpression(nullish)
    ) {
      throw new Error("Expected call expressions");
    }

    expect(converter.extractDescriptionFromArguments(described)).toBe("Human readable");
    expect(
      converter.extractDescriptionFromArguments(parseInitializer("z.string()") as t.CallExpression),
    ).toBe(null);
    expect(converter.isOptional(optional)).toBe(true);
    expect(converter.isOptional(nullish)).toBe(true);
    expect(converter.hasOptionalMethod(nullish)).toBe(true);
    expect(converter.hasOptionalMethod(t.identifier("nope") as never)).toBe(false);

    converter.zodSchemas.UserSchema = { type: "object" };
    expect(converter.getProcessedSchemas()).toEqual({
      UserSchema: { type: "object" },
    });
  });

  it("pre-scans infer mappings from schema files", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-zod-converter-prescan-"));
    roots.push(root);

    const schemaFile = path.join(root, "schemas.ts");
    fs.writeFileSync(
      schemaFile,
      [
        'import { z } from "zod";',
        "export const UserSchema = z.object({ id: z.string() });",
        "export type UserFromZod = z.infer<typeof UserSchema>;",
      ].join("\n"),
    );

    const converter = new ZodSchemaConverter(root);
    converter.scanFileForTypeMappings(schemaFile);

    expect(converter.typeToSchemaMapping).toEqual({
      UserFromZod: "UserSchema",
    });
  });

  it("supports zod v4 import paths without eagerly materializing inferred aliases", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-zod-converter-v4-"));
    roots.push(root);

    const schemaFile = path.join(root, "schemas.ts");
    fs.writeFileSync(
      schemaFile,
      [
        'import { z } from "zod/v4";',
        "export const LoginResponseSchema = z.object({ id: z.uuid() });",
        "export type LoginResponse = z.infer<typeof LoginResponseSchema>;",
      ].join("\n"),
    );

    const converter = new ZodSchemaConverter(root);
    converter.processAllSchemasInFile(schemaFile);
    converter.scanFileForTypeMappings(schemaFile);

    expect(converter.zodSchemas.LoginResponseSchema).toEqual({
      type: "object",
      properties: {
        id: {
          type: "string",
          format: "uuid",
        },
      },
      required: ["id"],
    });
    expect(converter.zodSchemas).not.toHaveProperty("LoginResponse");
    expect(converter.convertZodSchemaToOpenApi("LoginResponse")).toEqual({
      type: "object",
      properties: {
        id: {
          type: "string",
          format: "uuid",
        },
      },
      required: ["id"],
    });
  });

  it("resolves z.enum with TS enum identifiers", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-zod-converter-enum-ref-"));
    roots.push(root);

    fs.writeFileSync(
      path.join(root, "schemas.ts"),
      [
        'import { z } from "zod";',
        "",
        "enum Color {",
        '  Red = "red",',
        '  Green = "green",',
        '  Blue = "blue",',
        "}",
        "",
        "export const itemSchema = z.object({",
        "  color: z.enum(Color),",
        "});",
      ].join("\n"),
    );

    const converter = new ZodSchemaConverter(root);
    converter.convertZodSchemaToOpenApi("itemSchema");

    expect(converter.zodSchemas.itemSchema).toEqual({
      type: "object",
      properties: {
        color: { type: "string", enum: ["red", "green", "blue"] },
      },
      required: ["color"],
    });
  });

  it("resolves z.enum with as-const object identifiers", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-zod-converter-const-ref-"));
    roots.push(root);

    fs.writeFileSync(
      path.join(root, "schemas.ts"),
      [
        'import { z } from "zod";',
        "",
        "const STATUS = {",
        '  Active: "active",',
        '  Inactive: "inactive",',
        '  Pending: "pending",',
        "} as const;",
        "",
        "export const taskSchema = z.object({",
        "  status: z.enum(STATUS),",
        "});",
      ].join("\n"),
    );

    const converter = new ZodSchemaConverter(root);
    converter.convertZodSchemaToOpenApi("taskSchema");

    expect(converter.zodSchemas.taskSchema).toEqual({
      type: "object",
      properties: {
        status: { type: "string", enum: ["active", "inactive", "pending"] },
      },
      required: ["status"],
    });
  });

  it("resolves z.enum with as-const array identifiers", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-zod-converter-arr-ref-"));
    roots.push(root);

    fs.writeFileSync(
      path.join(root, "schemas.ts"),
      [
        'import { z } from "zod";',
        "",
        'const ROLES = ["admin", "editor", "viewer"] as const;',
        "",
        "export const roleSchema = z.object({",
        "  role: z.enum(ROLES),",
        "});",
      ].join("\n"),
    );

    const converter = new ZodSchemaConverter(root);
    converter.convertZodSchemaToOpenApi("roleSchema");

    expect(converter.zodSchemas.roleSchema).toEqual({
      type: "object",
      properties: {
        role: { type: "string", enum: ["admin", "editor", "viewer"] },
      },
      required: ["role"],
    });
  });

  it("resolves z.enum with numeric TS enum identifiers", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-zod-converter-num-enum-"));
    roots.push(root);

    fs.writeFileSync(
      path.join(root, "schemas.ts"),
      [
        'import { z } from "zod";',
        "",
        "enum HttpStatus {",
        "  OK = 200,",
        "  NotFound = 404,",
        "  ServerError = 500,",
        "}",
        "",
        "export const responseSchema = z.object({",
        "  status: z.enum(HttpStatus),",
        "});",
      ].join("\n"),
    );

    const converter = new ZodSchemaConverter(root);
    converter.convertZodSchemaToOpenApi("responseSchema");

    expect(converter.zodSchemas.responseSchema).toEqual({
      type: "object",
      properties: {
        status: { type: "number", enum: [200, 404, 500] },
      },
      required: ["status"],
    });
  });

  describe(".meta({ id }) component name override", () => {
    it("uses the id as the component name for an exported schema", () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-zod-meta-id-export-"));
      roots.push(root);

      fs.writeFileSync(
        path.join(root, "schemas.ts"),
        [
          'import { z } from "zod";',
          'export const audioSchema = z.object({ url: z.string() }).meta({ id: "Audio" });',
        ].join("\n"),
      );

      const converter = new ZodSchemaConverter(root);
      converter.convertZodSchemaToOpenApi("audioSchema");

      expect(converter.zodSchemas["Audio"]).toMatchObject({
        type: "object",
        properties: { url: { type: "string" } },
        required: ["url"],
      });
      expect(converter.zodSchemas).not.toHaveProperty("audioSchema");
    });

    it("sets typeToSchemaMapping[varName] = id when names differ", () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-zod-meta-id-mapping-"));
      roots.push(root);

      fs.writeFileSync(
        path.join(root, "schemas.ts"),
        [
          'import { z } from "zod";',
          'export const audioSchema = z.object({ url: z.string() }).meta({ id: "Audio" });',
        ].join("\n"),
      );

      const converter = new ZodSchemaConverter(root);
      converter.convertZodSchemaToOpenApi("audioSchema");

      expect(converter.typeToSchemaMapping["audioSchema"]).toBe("Audio");
    });

    it("keeps extra meta fields in schema body but excludes id", () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-zod-meta-id-extra-"));
      roots.push(root);

      fs.writeFileSync(
        path.join(root, "schemas.ts"),
        [
          'import { z } from "zod";',
          'export const audioSchema = z.object({ url: z.string() }).meta({ id: "Audio", description: "An audio file" });',
        ].join("\n"),
      );

      const converter = new ZodSchemaConverter(root);
      converter.convertZodSchemaToOpenApi("audioSchema");

      expect(converter.zodSchemas["Audio"]).toMatchObject({
        type: "object",
        description: "An audio file",
      });
      expect(converter.zodSchemas["Audio"]).not.toHaveProperty("id");
    });

    it("preserves old behaviour when no .meta({ id }) is present", () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-zod-meta-id-none-"));
      roots.push(root);

      fs.writeFileSync(
        path.join(root, "schemas.ts"),
        [
          'import { z } from "zod";',
          "export const UserSchema = z.object({ name: z.string() });",
        ].join("\n"),
      );

      const converter = new ZodSchemaConverter(root);
      converter.convertZodSchemaToOpenApi("UserSchema");

      expect(converter.zodSchemas["UserSchema"]).toEqual({
        type: "object",
        properties: { name: { type: "string" } },
        required: ["name"],
      });
      expect(converter.typeToSchemaMapping).not.toHaveProperty("UserSchema");
    });

    it("ignores duplicate id and keeps the first schema when two schemas share the same .meta({ id })", () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-zod-meta-id-conflict-"));
      roots.push(root);

      fs.writeFileSync(
        path.join(root, "schemas.ts"),
        [
          'import { z } from "zod";',
          'export const firstSchema = z.object({ a: z.string() }).meta({ id: "Shared" });',
          'export const secondSchema = z.object({ b: z.number() }).meta({ id: "Shared" });',
        ].join("\n"),
      );

      const converter = new ZodSchemaConverter(root);
      converter.convertZodSchemaToOpenApi("firstSchema");
      converter.convertZodSchemaToOpenApi("secondSchema");

      expect(converter.zodSchemas["Shared"]).toMatchObject({
        type: "object",
        properties: { a: { type: "string" } },
      });
      expect(converter.zodSchemas["Shared"]).not.toHaveProperty("properties.b");
    });

    it("emits $ref to meta-id name when schema is referenced inside z.array()", () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-zod-meta-id-array-"));
      roots.push(root);

      fs.writeFileSync(
        path.join(root, "schemas.ts"),
        [
          'import { z } from "zod";',
          'export const apiErrorIssueSchema = z.object({ path: z.string(), message: z.string() }).meta({ id: "ApiErrorIssue" });',
          'export const apiErrorSchema = z.object({ message: z.string(), issues: z.array(apiErrorIssueSchema) }).meta({ id: "ApiError" });',
        ].join("\n"),
      );

      const converter = new ZodSchemaConverter(root);
      converter.convertZodSchemaToOpenApi("apiErrorSchema");

      expect(converter.zodSchemas["ApiError"]).toBeDefined();
      expect(converter.zodSchemas["ApiError"]?.properties?.issues).toMatchObject({
        type: "array",
        items: { $ref: "#/components/schemas/ApiErrorIssue" },
      });
      expect(converter.zodSchemas["ApiErrorIssue"]).toBeDefined();
    });

    it("emits $ref to meta-id name when schema is referenced inside z.array().optional()", () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-zod-meta-id-array-opt-"));
      roots.push(root);

      fs.writeFileSync(
        path.join(root, "schemas.ts"),
        [
          'import { z } from "zod";',
          'export const apiErrorIssueSchema = z.object({ path: z.string() }).meta({ id: "ApiErrorIssue" });',
          'export const apiErrorSchema = z.object({ issues: z.array(apiErrorIssueSchema).optional() }).meta({ id: "ApiError" });',
        ].join("\n"),
      );

      const converter = new ZodSchemaConverter(root);
      converter.convertZodSchemaToOpenApi("apiErrorSchema");

      expect(converter.zodSchemas["ApiError"]).toBeDefined();
      expect(converter.zodSchemas["ApiError"]?.properties?.issues).toMatchObject({
        type: "array",
        items: { $ref: "#/components/schemas/ApiErrorIssue" },
      });
    });
  });

  describe("constant reference resolution in chain methods", () => {
    it("resolves const numeric references in .min(), .max(), and .length()", () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-zod-const-num-"));
      roots.push(root);

      fs.writeFileSync(
        path.join(root, "schemas.ts"),
        [
          'import { z } from "zod";',
          "",
          "const MAX_CHARS = 5000;",
          "const MAX_ITEMS = 10;",
          "const MIN_ITEMS = 1;",
          "const EXACT_LEN = 4;",
          "const MIN_VAL = 0;",
          "const MAX_VAL = 100;",
          "",
          "export const InputSchema = z.object({",
          "  texts: z.array(z.string().max(MAX_CHARS)).min(MIN_ITEMS).max(MAX_ITEMS),",
          "  code: z.string().length(EXACT_LEN),",
          "  score: z.number().min(MIN_VAL).max(MAX_VAL),",
          "});",
        ].join("\n"),
      );

      const converter = new ZodSchemaConverter(root);
      converter.processAllSchemasInFile(path.join(root, "schemas.ts"));

      expect(converter.zodSchemas.InputSchema).toEqual({
        type: "object",
        properties: {
          texts: {
            type: "array",
            items: { type: "string", maxLength: 5000 },
            minItems: 1,
            maxItems: 10,
          },
          code: { type: "string", minLength: 4, maxLength: 4 },
          score: { type: "number", minimum: 0, maximum: 100 },
        },
        required: ["texts", "code", "score"],
      });
    });

    it("resolves const string references in .describe(), .startsWith(), .endsWith(), .includes()", () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-zod-const-str-"));
      roots.push(root);

      fs.writeFileSync(
        path.join(root, "schemas.ts"),
        [
          'import { z } from "zod";',
          "",
          'const FIELD_DESC = "User email address";',
          'const PREFIX = "http";',
          'const SUFFIX = ".com";',
          'const CONTAINS = "@";',
          "",
          "export const FieldSchema = z.object({",
          "  email: z.string().describe(FIELD_DESC),",
          "  url: z.string().startsWith(PREFIX),",
          "  domain: z.string().endsWith(SUFFIX),",
          "  contact: z.string().includes(CONTAINS),",
          "});",
        ].join("\n"),
      );

      const converter = new ZodSchemaConverter(root);
      converter.processAllSchemasInFile(path.join(root, "schemas.ts"));

      expect(converter.zodSchemas.FieldSchema).toEqual({
        type: "object",
        properties: {
          email: { type: "string", description: "User email address" },
          url: { type: "string", pattern: "^http" },
          domain: { type: "string", pattern: "\\.com$" },
          contact: { type: "string", pattern: "@" },
        },
        required: ["email", "url", "domain", "contact"],
      });
    });

    it("resolves constants through 'as number' type assertions", () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-zod-const-as-"));
      roots.push(root);

      fs.writeFileSync(
        path.join(root, "schemas.ts"),
        [
          'import { z } from "zod";',
          "",
          "const MAX_LEN = 100;",
          "",
          "export const Schema = z.object({",
          "  name: z.string().max(MAX_LEN as number),",
          "});",
        ].join("\n"),
      );

      const converter = new ZodSchemaConverter(root);
      converter.processAllSchemasInFile(path.join(root, "schemas.ts"));

      expect(converter.zodSchemas.Schema).toEqual({
        type: "object",
        properties: {
          name: { type: "string", maxLength: 100 },
        },
        required: ["name"],
      });
    });

    it("resolves const references in .default()", () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-zod-const-default-"));
      roots.push(root);

      fs.writeFileSync(
        path.join(root, "schemas.ts"),
        [
          'import { z } from "zod";',
          "",
          "const DEFAULT_COUNT = 42;",
          'const DEFAULT_NAME = "anonymous";',
          "",
          "export const Schema = z.object({",
          "  count: z.number().default(DEFAULT_COUNT),",
          "  name: z.string().default(DEFAULT_NAME),",
          "});",
        ].join("\n"),
      );

      const converter = new ZodSchemaConverter(root);
      converter.processAllSchemasInFile(path.join(root, "schemas.ts"));

      expect(converter.zodSchemas.Schema).toEqual({
        type: "object",
        properties: {
          count: { type: "number", default: 42 },
          name: { type: "string", default: "anonymous" },
        },
        required: ["count", "name"],
      });
    });

    it("resolves imported constants from another file", () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-zod-const-import-"));
      roots.push(root);

      fs.writeFileSync(
        path.join(root, "constants.ts"),
        ["export const MAX_ITEMS = 50;", 'export const DESCRIPTION = "Items list";'].join("\n"),
      );

      fs.writeFileSync(
        path.join(root, "schemas.ts"),
        [
          'import { z } from "zod";',
          'import { MAX_ITEMS, DESCRIPTION } from "./constants";',
          "",
          "export const ListSchema = z.object({",
          "  items: z.array(z.string()).max(MAX_ITEMS).describe(DESCRIPTION),",
          "});",
        ].join("\n"),
      );

      const converter = new ZodSchemaConverter(root);
      converter.processAllSchemasInFile(path.join(root, "schemas.ts"));

      expect(converter.zodSchemas.ListSchema).toEqual({
        type: "object",
        properties: {
          items: {
            type: "array",
            items: { type: "string" },
            maxItems: 50,
            description: "Items list",
          },
        },
        required: ["items"],
      });
    });
  });
});
