import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import * as t from "@babel/types";
import { afterEach, describe, expect, it } from "vitest";

import { createSharedGenerationRuntime } from "@workspace/openapi-core/core/runtime.js";
import { DiagnosticsCollector } from "@workspace/openapi-core/diagnostics/collector.js";
import { ZodSchemaConverter } from "@workspace/openapi-core/schema/zod/zod-converter.js";
import { parseTypeScriptFile } from "@workspace/openapi-core/shared/utils.js";

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

    const sortPaths = (left: string, right: string) => left.localeCompare(right);
    expect(routeFiles.toSorted(sortPaths)).toEqual(
      [path.join(root, "api", "route.ts"), path.join(nestedDir, "user-api.ts")].toSorted(sortPaths),
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

  it("dispatches leftover zod-node reference, coerce, and factory shapes", () => {
    const converter = new ZodSchemaConverter(process.cwd());
    converter.zodSchemas.UserSchema = {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    };
    converter.zodSchemas.UserBaseSchema = {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    };

    expect(converter.processZodNode(parseInitializer("z.coerce.string()"))).toEqual({
      type: "string",
    });
    expect(converter.processZodNode(parseInitializer("z.coerce.number()"))).toEqual({
      type: "number",
    });
    expect(converter.processZodNode(parseInitializer("UserSchema.optional()"))).toEqual({
      allOf: [{ $ref: "#/components/schemas/UserSchema" }],
    });
    expect(converter.processZodNode(parseInitializer("UserSchema.nullable()"))).toEqual({
      anyOf: [{ $ref: "#/components/schemas/UserSchema" }, { type: "null" }],
    });
    expect(converter.processZodNode(parseInitializer('UserSchema.describe("User")'))).toEqual({
      allOf: [{ $ref: "#/components/schemas/UserSchema" }],
      description: "User",
    });
    expect(
      converter.processZodNode(parseInitializer("UserBaseSchema.extend({ name: z.string() })")),
    ).toMatchObject({
      type: "object",
    });
    expect(converter.processZodNode(parseInitializer("z.lazy(() => UserSchema)"))).toEqual({
      $ref: "#/components/schemas/UserSchema",
    });
    expect(converter.processZodNode(parseInitializer("UnknownFactory(UserSchema)"))).toEqual({
      type: "object",
    });
    expect(converter.processZodNode(parseInitializer("UserSchema"))).toEqual({
      $ref: "#/components/schemas/UserSchema",
    });
    expect(converter.processZodNode(parseInitializer("z.optional()"))).toEqual({ type: "string" });
    expect(converter.processZodNode(parseInitializer("z.nullable()"))).toEqual({ type: "string" });
    expect(converter.processZodNode(parseInitializer("z.nullish()"))).toEqual({ type: "string" });
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
      contentMediaType: "application/octet-stream",
    });
    expect(converter.processZodNode(parseInitializer("z.custom<Blob>()"))).toEqual({
      type: "string",
      contentMediaType: "application/octet-stream",
    });
    expect(converter.processZodNode(parseInitializer("z.custom<Buffer>()"))).toEqual({
      type: "string",
      contentMediaType: "application/octet-stream",
    });
    expect(converter.processZodNode(parseInitializer("z.custom<Uint8Array>()"))).toEqual({
      type: "string",
      contentMediaType: "application/octet-stream",
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

  it("emits diagnostics for unknown Zod helpers and chain methods", () => {
    const diagnostics = new DiagnosticsCollector();
    const converter = new ZodSchemaConverter(process.cwd(), undefined, undefined, diagnostics);

    expect(converter.processZodNode(parseInitializer("z.mystery()"))).toEqual({
      type: "string",
    });
    expect(converter.processZodNode(parseInitializer("z.string().mysteryMethod()"))).toEqual({
      type: "string",
    });

    expect(diagnostics.getAll()).toEqual([
      expect.objectContaining({
        code: "unknown-zod-helper",
        severity: "warning",
        metadata: { name: "mystery" },
      }),
      expect.objectContaining({
        code: "unknown-zod-method",
        severity: "warning",
        metadata: { name: "mysteryMethod" },
      }),
    ]);
  });

  it("emits diagnostics for unresolved enums and malformed discriminated unions", () => {
    const diagnostics = new DiagnosticsCollector();
    const converter = new ZodSchemaConverter(process.cwd(), undefined, undefined, diagnostics);

    expect(converter.processZodNode(parseInitializer("z.enum(UnknownEnum)"))).toEqual({
      type: "string",
    });
    expect(
      converter.processZodNode(parseInitializer('z.discriminatedUnion("kind", z.string())')),
    ).toEqual({
      type: "object",
    });

    expect(diagnostics.getAll()).toEqual([
      expect.objectContaining({
        code: "unresolved-zod-enum",
        severity: "warning",
        metadata: { name: "UnknownEnum" },
      }),
      expect.objectContaining({
        code: "malformed-zod-discriminated-union",
        severity: "warning",
      }),
    ]);
  });

  it("emits a pattern for static z.templateLiteral schemas", () => {
    const converter = new ZodSchemaConverter(process.cwd());

    expect(
      converter.processZodNode(
        parseInitializer('z.templateLiteral(["v", z.literal(1), "-", z.number()])'),
      ),
    ).toEqual({
      type: "string",
      pattern: "^v(1)--?\\d+(?:\\.\\d+)?$",
    });
  });

  it("preserves statically resolvable computed object keys", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-zod-computed-"));
    roots.push(root);
    const schemaFile = path.join(root, "schemas.ts");
    fs.writeFileSync(
      schemaFile,
      `import { z } from "zod/v4";

const displayNameKey = "displayName" as const;

export const UserSchema = z.object({
  [displayNameKey]: z.string(),
});
`,
    );

    const converter = new ZodSchemaConverter(root);
    const schema = converter.convertZodSchemaToOpenApi("UserSchema");

    expect(schema).toMatchObject({
      type: "object",
      properties: {
        displayName: {
          type: "string",
        },
      },
      required: ["displayName"],
    });
  });

  it("expands factory calls with destructured object parameters", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-zod-factory-destructured-"));
    roots.push(root);
    const schemaFile = path.join(root, "schemas.ts");
    fs.writeFileSync(
      schemaFile,
      `import { z } from "zod/v4";

function createEnvelope({ data }: { data: z.ZodTypeAny }) {
  return z.object({
    ok: z.boolean(),
    data,
  });
}

export const EnvelopeSchema = createEnvelope({
  data: z.string(),
});
`,
    );

    const converter = new ZodSchemaConverter(root);
    const schema = converter.convertZodSchemaToOpenApi("EnvelopeSchema");

    expect(schema).toMatchObject({
      type: "object",
      properties: {
        ok: {
          type: "boolean",
        },
        data: {
          type: "string",
        },
      },
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

    it("covers leftover pick, infer, pipe, bounds, and parse-error branches", () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-zod-leftover-"));
      roots.push(root);

      fs.writeFileSync(
        path.join(root, "schemas.ts"),
        [
          'import { z } from "zod";',
          "",
          "const MASK = { id: true, name: false };",
          'const KEYS = ["id"];',
          "const EXTRA = { role: z.string() };",
          "",
          "export const UserSchema = z.object({",
          "  id: z.string(),",
          "  name: z.string(),",
          "  email: z.string(),",
          "});",
          "",
          "export const PickedMask = UserSchema.pick(MASK);",
          "export const PickedKeys = UserSchema.pick(KEYS);",
          'export const PickedQuoted = UserSchema.pick({ "id": true });',
          "export const ExtendedConst = UserSchema.extend(EXTRA);",
          "export const PipedRef = z.string().pipe(UserSchema);",
          "export const PipedUnion = z.string().pipe(z.union([z.string(), z.number()]));",
          "export const BoundedHigh = z.number().min(1).gt(5);",
          "export const BoundedLow = z.number().max(10).lt(3);",
          "export const Deep = z",
          "  .object({",
          "    items: z.array(z.object({ id: z.string() })),",
          "    either: z.union([z.object({ a: z.string() }), z.object({ b: z.number() })]),",
          "  })",
          "  .deepPartial();",
          "export const Named = z.string().meta({ id: 'NamedString' });",
          "export type User = z.infer<typeof UserSchema>;",
        ].join("\n"),
      );

      const converter = new ZodSchemaConverter(root);
      const schemaFile = path.join(root, "schemas.ts");
      converter.processFileForZodSchema(schemaFile, "User");
      for (const name of [
        "UserSchema",
        "PickedMask",
        "PickedKeys",
        "PickedQuoted",
        "ExtendedConst",
        "PipedRef",
        "PipedUnion",
        "BoundedHigh",
        "BoundedLow",
        "Deep",
        "Named",
      ]) {
        converter.convertZodSchemaToOpenApi(name);
      }
      converter.processAllSchemasInFile(schemaFile);

      expect(converter.zodSchemas.PickedMask).toMatchObject({
        type: "object",
        properties: { id: { type: "string" } },
      });
      expect(converter.zodSchemas.PickedKeys).toMatchObject({
        type: "object",
        properties: { id: { type: "string" } },
      });
      expect(converter.zodSchemas.PickedQuoted).toMatchObject({
        type: "object",
        properties: { id: { type: "string" } },
      });
      expect(converter.zodSchemas.ExtendedConst).toBeDefined();
      expect(converter.zodSchemas.PipedRef).toEqual({
        $ref: "#/components/schemas/UserSchema",
      });
      expect(converter.zodSchemas.PipedUnion).toMatchObject({
        anyOf: expect.any(Array),
      });
      expect(converter.zodSchemas.BoundedHigh).toMatchObject({ type: "number" });
      expect(converter.zodSchemas.BoundedLow).toMatchObject({ type: "number" });
      expect(converter.zodSchemas.Deep.required).toBeUndefined();
      expect(converter.zodSchemas.NamedString ?? converter.zodSchemas.Named).toBeDefined();
      expect(converter.typeToSchemaMapping.User).toBe("UserSchema");

      const broken = new ZodSchemaConverter(root, undefined, {
        existsSync: () => true,
        readdirSync: () => [],
        statSync: () => ({ isDirectory: () => false, isFile: () => true }) as fs.Stats,
        readFileSync: () => {
          throw new Error("boom");
        },
      });
      expect(() =>
        broken.processFileForZodSchema(path.join(root, "missing.ts"), "X"),
      ).not.toThrow();
      expect(() => broken.processAllSchemasInFile(path.join(root, "missing.ts"))).not.toThrow();
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

  it("covers leftover private mask, pipe, and deepPartial helpers", () => {
    const converter = new ZodSchemaConverter(process.cwd()) as unknown as {
      extractMaskKeysFromNode(arg: t.Node | undefined): string[];
      mergePipeSchema(
        base: Record<string, unknown>,
        piped: Record<string, unknown>,
      ): Record<string, unknown>;
      applyDeepPartial(schema: Record<string, unknown>): void;
      isZodLocalName(name: string | undefined): boolean;
      resolveMaskKeys(name: string): string[] | null;
      resolveConstObjectNode(name: string): t.ObjectExpression | null;
      resolveConstArrayValues(name: string): (string | number)[] | null;
    };

    expect(converter.extractMaskKeysFromNode(undefined)).toEqual([]);
    expect(
      converter.extractMaskKeysFromNode(t.tsAsExpression(t.objectExpression([]), t.tsAnyKeyword())),
    ).toEqual([]);
    expect(
      converter.extractMaskKeysFromNode(
        t.objectExpression([
          t.objectProperty(t.identifier("id"), t.booleanLiteral(true)),
          t.objectProperty(t.stringLiteral("name"), t.booleanLiteral(true)),
          t.objectProperty(t.identifier("skip"), t.booleanLiteral(false)),
        ]),
      ),
    ).toEqual(["id", "name"]);
    expect(
      converter.extractMaskKeysFromNode(
        t.arrayExpression([t.stringLiteral("id"), t.numericLiteral(1), null]),
      ),
    ).toEqual(["id"]);
    expect(converter.extractMaskKeysFromNode(t.identifier("UnknownMask"))).toEqual([]);
    expect(
      converter.mergePipeSchema({ type: "string" }, { $ref: "#/components/schemas/X" }),
    ).toEqual({ $ref: "#/components/schemas/X" });
    expect(converter.mergePipeSchema({ type: "string" }, { allOf: [{ type: "string" }] })).toEqual({
      allOf: [{ type: "string" }],
    });
    expect(converter.mergePipeSchema({ type: "string" }, { anyOf: [{ type: "string" }] })).toEqual({
      anyOf: [{ type: "string" }],
    });
    expect(converter.mergePipeSchema({ type: "string" }, { oneOf: [{ type: "string" }] })).toEqual({
      oneOf: [{ type: "string" }],
    });
    expect(converter.mergePipeSchema({ type: "string" }, { format: "email" })).toEqual({
      type: "string",
      format: "email",
    });

    const deep = {
      type: "object",
      required: ["items"],
      properties: {
        items: {
          type: "array",
          items: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
        },
      },
      allOf: [{ type: "object", required: ["a"], properties: { a: { type: "string" } } }],
      anyOf: [{ type: "object", required: ["b"], properties: { b: { type: "number" } } }],
      oneOf: [{ type: "object", required: ["c"], properties: { c: { type: "boolean" } } }],
    };
    converter.applyDeepPartial(deep);
    expect(deep.required).toBeUndefined();
    expect(
      (deep.properties.items as { items: { required?: string[] } }).items.required,
    ).toBeUndefined();
    converter.applyDeepPartial(null as never);
    expect(converter.isZodLocalName(undefined)).toBe(false);
    expect(converter.isZodLocalName("z")).toBe(true);
    expect(converter.isZodLocalName("zod")).toBe(false);
    expect(converter.resolveMaskKeys("MASK")).toBeNull();
    expect(converter.resolveConstObjectNode("OBJ")).toBeNull();
    expect(converter.resolveConstArrayValues("KEYS")).toBeNull();
  });

  it("covers leftover convert lookup, convention, circular, and route-file branches", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-zod-convert-leftover-"));
    roots.push(root);
    fs.mkdirSync(path.join(root, "api"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "schemas.ts"),
      [
        'import { z } from "zod";',
        "export const sliderSchema = z.object({ id: z.string() });",
      ].join("\n"),
    );
    fs.writeFileSync(
      path.join(root, "api", "route.ts"),
      [
        'import { z } from "zod";',
        "export const RouteOnlySchema = z.object({ ok: z.boolean() });",
      ].join("\n"),
    );

    const runtime = createSharedGenerationRuntime();
    const profile = { zodConvertMs: 0, zodPreScanMs: 0 } as never;
    const converter = new ZodSchemaConverter(
      root,
      path.join(root, "api"),
      undefined,
      undefined,
      undefined,
      runtime.schema.zod,
      profile,
    );

    converter.preprocessSchemaDirectories();
    expect(converter.convertZodSchemaToOpenApi("Slider", "")).toMatchObject({
      type: "object",
    });
    expect(converter.convertZodSchemaToOpenApi("sliderSchema")).toMatchObject({ type: "object" });

    converter.processingSchemas.add("MissingSchema");
    expect(converter.convertZodSchemaToOpenApi("MissingSchema")).toEqual({
      $ref: "#/components/schemas/MissingSchema",
    });
    converter.processingSchemas.delete("MissingSchema");

    expect(converter.convertZodSchemaToOpenApi("RouteOnlySchema")).toMatchObject({
      type: "object",
      properties: { ok: { type: "boolean" } },
    });
    expect(converter.convertZodSchemaToOpenApi("DefinitelyMissing")).toBeNull();
    expect(profile.zodConvertMs).toBeGreaterThanOrEqual(0);
  });

  it("covers identifier-chain transforms, factories, infer aliases, and scan errors", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-zod-chain-leftover-"));
    roots.push(root);
    fs.mkdirSync(path.join(root, "ignored"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "schemas.ts"),
      [
        'import { z } from "zod";',
        'import { createInsertSchema } from "drizzle-zod";',
        "",
        "const MASK = { id: true } as const;",
        'const KEYS = ["id"] as const;',
        "const EXTRA = { extra: z.boolean() };",
        "",
        "export const UserSchema = z.object({",
        "  id: z.string(),",
        "  secret: z.string(),",
        "  extra: z.number().optional(),",
        "});",
        "export const ExtraSchema = z.object({ tag: z.string() });",
        "export const PublicUserSchema = UserSchema.omit({ secret: true });",
        "export const PickedUserSchema = UserSchema.pick(MASK);",
        "export const PickedKeysSchema = UserSchema.pick(KEYS);",
        "export const PartialUserSchema = UserSchema.partial();",
        "export const RequiredUserSchema = UserSchema.required();",
        "export const ExtendedUserSchema = UserSchema.extend({ nick: z.string() });",
        "export const ExtendedFromConstSchema = UserSchema.extend(EXTRA);",
        "export const MergedUserSchema = UserSchema.merge(ExtraSchema);",
        "function createUserSchema() {",
        "  return z.object({ factory: z.string() });",
        "}",
        "export const FromFactorySchema = createUserSchema();",
        "export const MissingFactorySchema = missingFactory();",
        "export type User = z.infer<typeof UserSchema>;",
        "export const InsertSchema = createInsertSchema(users);",
      ].join("\n"),
    );

    const converter = new ZodSchemaConverter(root);
    converter.drizzleZodImports.add("createInsertSchema");
    expect(converter.convertZodSchemaToOpenApi("PublicUserSchema")).toMatchObject({
      type: "object",
      properties: expect.objectContaining({ id: { type: "string" } }),
    });
    expect(converter.convertZodSchemaToOpenApi("PickedUserSchema")?.properties).toEqual({
      id: { type: "string" },
    });
    expect(converter.convertZodSchemaToOpenApi("PickedKeysSchema")?.properties).toEqual({
      id: { type: "string" },
    });
    expect(converter.convertZodSchemaToOpenApi("PartialUserSchema")?.required).toBeUndefined();
    expect(converter.convertZodSchemaToOpenApi("RequiredUserSchema")?.required).toEqual(
      expect.arrayContaining(["id", "secret"]),
    );
    expect(converter.convertZodSchemaToOpenApi("ExtendedUserSchema")?.properties).toMatchObject({
      nick: { type: "string" },
    });
    expect(converter.convertZodSchemaToOpenApi("FromFactorySchema")).toMatchObject({
      type: "object",
      properties: { factory: { type: "string" } },
    });
    expect(converter.convertZodSchemaToOpenApi("User")).toMatchObject({ type: "object" });
    expect(converter.convertZodSchemaToOpenApi("MissingFactorySchema")).toBeDefined();

    const routeFiles: string[] = [];
    converter.findRouteFilesInDir(path.join(root, "missing-dir"), routeFiles);
    expect(routeFiles).toEqual([]);
    converter.findRouteFilesInDir(path.join(root, "ignored"), routeFiles);
    expect(routeFiles).toEqual([]);
  });

  it("covers leftover private argument, spread, and static-json helpers", () => {
    const converter = new ZodSchemaConverter(process.cwd()) as unknown as {
      currentFilePath?: string;
      currentAST?: t.File;
      resolveLiteralValue(name: string): unknown;
      unwrapTypeAssertion(node: t.Node | null | undefined): t.Node | undefined;
      resolveNumericArg(arg: t.Node | null | undefined): number | undefined;
      resolveStringArg(arg: t.Node | null | undefined): string | undefined;
      resolveStringArrayArg(arg: t.Node | null | undefined): string[] | undefined;
      resolveObjectSchemaNode(name: string): t.CallExpression | null;
      resolveSpreadMembers(argument: t.Expression): unknown;
      extractStaticJsonValue(node: t.Node | null | undefined): unknown;
      storeResolvedSchema(
        name: string,
        schema: Record<string, unknown>,
        contentType?: string,
      ): string;
      zodSchemas: Record<string, unknown>;
    };

    expect(converter.resolveLiteralValue("MISSING")).toBeUndefined();
    expect(converter.unwrapTypeAssertion(null)).toBeUndefined();
    expect(converter.unwrapTypeAssertion(t.stringLiteral("x"))).toMatchObject({
      type: "StringLiteral",
    });
    expect(
      converter.unwrapTypeAssertion(t.tsAsExpression(t.numericLiteral(2), t.tsNumberKeyword())),
    ).toMatchObject({
      type: "NumericLiteral",
    });
    expect(converter.resolveNumericArg(null)).toBeUndefined();
    expect(converter.resolveNumericArg(t.numericLiteral(4))).toBe(4);
    expect(converter.resolveNumericArg(t.unaryExpression("-", t.numericLiteral(3)))).toBe(-3);
    expect(converter.resolveNumericArg(t.identifier("COUNT"))).toBeUndefined();
    expect(converter.resolveStringArg(null)).toBeUndefined();
    expect(converter.resolveStringArg(t.stringLiteral("hi"))).toBe("hi");
    expect(converter.resolveStringArg(t.identifier("LABEL"))).toBeUndefined();
    expect(converter.resolveStringArrayArg(null)).toBeUndefined();
    expect(converter.resolveStringArrayArg(t.stringLiteral("solo"))).toEqual(["solo"]);
    expect(
      converter.resolveStringArrayArg(
        t.arrayExpression([t.stringLiteral("a"), t.identifier("nope")]),
      ),
    ).toEqual(["a"]);
    expect(converter.resolveStringArrayArg(t.arrayExpression([]))).toBeUndefined();
    expect(converter.resolveStringArrayArg(t.identifier("KEYS"))).toBeUndefined();
    expect(converter.resolveObjectSchemaNode("UserSchema")).toBeNull();
    expect(converter.resolveSpreadMembers(t.identifier("Base"))).toBeNull();
    expect(
      converter.resolveSpreadMembers(
        t.memberExpression(t.identifier("Base"), t.identifier("shape")),
      ),
    ).toBeNull();
    expect(converter.resolveSpreadMembers(t.numericLiteral(1) as never)).toBeNull();
    expect(converter.extractStaticJsonValue(null)).toBeUndefined();
    expect(converter.extractStaticJsonValue(t.nullLiteral())).toBeNull();
    expect(converter.extractStaticJsonValue(t.identifier("MISSING"))).toBeUndefined();
    expect(
      converter.extractStaticJsonValue(t.tsAsExpression(t.stringLiteral("x"), t.tsStringKeyword())),
    ).toBe("x");
    expect(
      converter.extractStaticJsonValue(t.arrayExpression([t.spreadElement(t.identifier("rest"))])),
    ).toBeUndefined();
    expect(
      converter.extractStaticJsonValue(t.objectExpression([t.spreadElement(t.identifier("rest"))])),
    ).toBeUndefined();
    expect(
      converter.extractStaticJsonValue(
        t.objectExpression([t.objectProperty(t.identifier("id"), t.identifier("MISSING"))]),
      ),
    ).toBeUndefined();
    expect(converter.extractStaticJsonValue(t.booleanLiteral(true))).toBe(true);
    expect(converter.extractStaticJsonValue(t.numericLiteral(4))).toBe(4);
    expect(converter.extractStaticJsonValue(t.arrayExpression([t.stringLiteral("a")]))).toEqual([
      "a",
    ]);
    expect(
      converter.extractStaticJsonValue(
        t.objectExpression([t.objectProperty(t.stringLiteral("id"), t.stringLiteral("x"))]),
      ),
    ).toEqual({ id: "x" });
    expect(
      converter.extractStaticJsonValue(
        t.objectExpression([t.objectProperty(t.numericLiteral(1), t.stringLiteral("x"))]),
      ),
    ).toBeUndefined();
    expect(
      converter.extractStaticJsonValue(t.arrayExpression([t.identifier("MISSING")])),
    ).toBeUndefined();
    expect(
      (
        converter as unknown as { extractMetaIdFromNode(node: t.Node): string | null }
      ).extractMetaIdFromNode(t.identifier("x")),
    ).toBeNull();
    expect(
      (
        converter as unknown as { extractMetaIdFromNode(node: t.Node): string | null }
      ).extractMetaIdFromNode(
        t.callExpression(
          t.memberExpression(
            t.callExpression(t.memberExpression(t.identifier("z"), t.identifier("string")), []),
            t.identifier("meta"),
          ),
          [t.objectExpression([t.objectProperty(t.identifier("id"), t.stringLiteral("User"))])],
        ),
      ),
    ).toBe("User");
    expect(
      (
        converter as unknown as { shouldUseRuntimeExport(node: t.Node): boolean }
      ).shouldUseRuntimeExport(t.identifier("x")),
    ).toBe(false);
    expect(
      (
        converter as unknown as { shouldUseRuntimeExport(node: t.Node): boolean }
      ).shouldUseRuntimeExport(parseInitializer("z.coerce.string()")),
    ).toBe(true);
    expect(
      (
        converter as unknown as { shouldUseRuntimeExport(node: t.Node): boolean }
      ).shouldUseRuntimeExport(parseInitializer("z.string().pipe(z.number())")),
    ).toBe(true);
    expect(
      (
        converter as unknown as { shouldUseRuntimeExport(node: t.Node): boolean }
      ).shouldUseRuntimeExport(parseInitializer("z.stringbool()")),
    ).toBe(true);
    expect(
      (
        converter as unknown as { shouldUseRuntimeExport(node: t.Node): boolean }
      ).shouldUseRuntimeExport(parseInitializer("z.templateLiteral([])")),
    ).toBe(true);
    expect(
      (
        converter as unknown as { shouldUseRuntimeExport(node: t.Node): boolean }
      ).shouldUseRuntimeExport(parseInitializer("z.prefault(z.string(), 'x')")),
    ).toBe(true);
    expect(
      (
        converter as unknown as {
          processZodFunctionalWrapper(method: string, node: t.CallExpression): unknown;
        }
      ).processZodFunctionalWrapper("extend", parseInitializer("z.extend()") as t.CallExpression),
    ).toEqual({ type: "object" });
    expect(
      (
        converter as unknown as {
          processZodFunctionalWrapper(method: string, node: t.CallExpression): unknown;
        }
      ).processZodFunctionalWrapper(
        "readonly",
        parseInitializer("z.readonly(z.string())") as t.CallExpression,
      ),
    ).toMatchObject({ readOnly: true });
    expect(
      (
        converter as unknown as {
          processZodFunctionalWrapper(method: string, node: t.CallExpression): unknown;
        }
      ).processZodFunctionalWrapper(
        "describe",
        parseInitializer('z.describe(z.string(), "@deprecated old")') as t.CallExpression,
      ),
    ).toMatchObject({ deprecated: true, description: "old" });
    expect(
      (
        converter as unknown as {
          processZodFunctionalWrapper(method: string, node: t.CallExpression): unknown;
        }
      ).processZodFunctionalWrapper(
        "describe",
        parseInitializer('z.describe(z.string(), "plain")') as t.CallExpression,
      ),
    ).toMatchObject({ description: "plain" });
    expect(
      (
        converter as unknown as {
          processZodFunctionalWrapper(method: string, node: t.CallExpression): unknown;
        }
      ).processZodFunctionalWrapper(
        "describe",
        parseInitializer("z.describe(z.string())") as t.CallExpression,
      ),
    ).toMatchObject({ type: "string" });
    expect(
      (
        converter as unknown as {
          processZodFunctionalWrapper(method: string, node: t.CallExpression): unknown;
        }
      ).processZodFunctionalWrapper(
        "default",
        parseInitializer('z.default(z.string(), "ready")') as t.CallExpression,
      ),
    ).toMatchObject({ default: "ready" });
    expect(
      (
        converter as unknown as {
          processZodFunctionalWrapper(method: string, node: t.CallExpression): unknown;
        }
      ).processZodFunctionalWrapper(
        "prefault",
        parseInitializer('z.prefault(z.string(), "ready")') as t.CallExpression,
      ),
    ).toMatchObject({ default: "ready" });
    expect(
      (
        converter as unknown as {
          processZodFunctionalWrapper(method: string, node: t.CallExpression): unknown;
        }
      ).processZodFunctionalWrapper(
        "catch",
        parseInitializer('z.catch(z.string(), "ready")') as t.CallExpression,
      ),
    ).toMatchObject({ default: "ready" });
    expect(
      (
        converter as unknown as {
          processZodFunctionalWrapper(method: string, node: t.CallExpression): unknown;
        }
      ).processZodFunctionalWrapper(
        "unknown",
        parseInitializer("z.readonly(z.string())") as t.CallExpression,
      ),
    ).toMatchObject({ type: "string" });
    expect(
      (
        converter as unknown as {
          processZodFunctionalWrapper(method: string, node: t.CallExpression): unknown;
        }
      ).processZodFunctionalWrapper(
        "readonly",
        parseInitializer("z.readonly()") as t.CallExpression,
      ),
    ).toEqual({ type: "object" });
    expect(
      (
        converter as unknown as {
          processZodFunctionalWrapper(method: string, node: t.CallExpression): unknown;
        }
      ).processZodFunctionalWrapper(
        "default",
        parseInitializer("z.default(z.string())") as t.CallExpression,
      ),
    ).toMatchObject({ type: "string" });
    expect(
      (
        converter as unknown as {
          processZodFunctionalWrapper(method: string, node: t.CallExpression): unknown;
        }
      ).processZodFunctionalWrapper(
        "catch",
        parseInitializer("z.catch(z.string())") as t.CallExpression,
      ),
    ).toMatchObject({ type: "string" });
    expect(
      (
        converter as unknown as {
          applyFunctionalCheckArg(schema: Record<string, unknown>, arg: t.CallExpression): unknown;
        }
      ).applyFunctionalCheckArg(
        { type: "string" },
        parseInitializer("z.min(1)") as t.CallExpression,
      ),
    ).toMatchObject({ type: "string" });
    expect(
      (
        converter as unknown as {
          applyFunctionalCheckArg(schema: Record<string, unknown>, arg: t.CallExpression): unknown;
        }
      ).applyFunctionalCheckArg(
        { type: "string" },
        parseInitializer("z.refine(() => true)") as t.CallExpression,
      ),
    ).toEqual({ type: "string" });
    expect(
      (
        converter as unknown as {
          applyFunctionalCheckArg(schema: Record<string, unknown>, arg: t.CallExpression): unknown;
        }
      ).applyFunctionalCheckArg(
        { type: "string" },
        parseInitializer("z.trim()") as t.CallExpression,
      ),
    ).toEqual({ type: "string" });
    expect(
      (
        converter as unknown as {
          applyFunctionalCheckArg(schema: Record<string, unknown>, arg: t.CallExpression): unknown;
        }
      ).applyFunctionalCheckArg(
        { type: "string" },
        parseInitializer("z.email()") as t.CallExpression,
      ),
    ).toMatchObject({ format: "email" });
    expect(
      (
        converter as unknown as {
          applyFunctionalCheckArg(schema: Record<string, unknown>, arg: t.CallExpression): unknown;
        }
      ).applyFunctionalCheckArg(
        { type: "string" },
        parseInitializer("z.minLength(2)") as t.CallExpression,
      ),
    ).toMatchObject({ type: "string" });
    expect(
      (
        converter as unknown as {
          applyFunctionalCheckArg(schema: Record<string, unknown>, arg: t.CallExpression): unknown;
        }
      ).applyFunctionalCheckArg(
        { type: "string" },
        parseInitializer("z.unknownCheck()") as t.CallExpression,
      ),
    ).toEqual({ type: "string" });
    expect(
      (
        converter as unknown as {
          applyFunctionalCheckArg(schema: Record<string, unknown>, arg: t.CallExpression): unknown;
        }
      ).applyFunctionalCheckArg(
        { type: "string" },
        parseInitializer("other.min(1)") as t.CallExpression,
      ),
    ).toMatchObject({ type: "string" });
    expect(
      (
        converter as unknown as {
          mergeExtendedObject(base: Record<string, unknown>, shape: t.Node): unknown;
        }
      ).mergeExtendedObject({ $ref: "#/components/schemas/MissingBase" }, t.identifier("shape")),
    ).toEqual({ $ref: "#/components/schemas/MissingBase" });
    expect(
      (
        converter as unknown as {
          mergeExtendedObject(base: Record<string, unknown>, shape: t.Node): unknown;
        }
      ).mergeExtendedObject(
        { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
        t.objectExpression([
          t.objectProperty(
            t.identifier("name"),
            t.callExpression(t.memberExpression(t.identifier("z"), t.identifier("string")), []),
          ),
        ]),
      ),
    ).toMatchObject({
      properties: expect.objectContaining({
        id: { type: "string" },
        name: { type: "string" },
      }),
    });

    expect(
      (
        converter as unknown as {
          isPropertyOptional(node: t.Node): boolean;
        }
      ).isPropertyOptional(t.identifier("x")),
    ).toBe(false);
    expect(
      (
        converter as unknown as {
          isPropertyOptional(node: t.Node): boolean;
        }
      ).isPropertyOptional(parseInitializer("z.string().optional()")),
    ).toBe(true);
    expect(
      (
        converter as unknown as {
          reconcileNumericBounds(schema: Record<string, unknown>): void;
        }
      ).reconcileNumericBounds({ minimum: 1, exclusiveMinimum: 2 }),
    ).toBeUndefined();
    expect(
      (
        converter as unknown as {
          reconcileNumericBounds(schema: Record<string, unknown>): void;
        }
      ).reconcileNumericBounds({ minimum: 3, exclusiveMinimum: 1 }),
    ).toBeUndefined();
    expect(converter.resolveStringArrayArg(t.identifier("LABELS"))).toBeUndefined();
    converter.currentFilePath = "/virtual.ts";
    converter.currentAST = parseTypeScriptFile(
      ['const LABELS = ["a", "b"] as const;', "const KEY = 'nick';"].join("\n"),
    );
    expect(
      (
        converter as unknown as {
          resolveStringArrayArg(node: t.Node): string[] | undefined;
          resolveLiteralValue(name: string): unknown;
        }
      ).resolveStringArrayArg(t.identifier("LABELS")),
    ).toEqual(["a", "b"]);
    expect(
      (
        converter as unknown as {
          mergeExtendedObject(base: Record<string, unknown>, shape: t.Node): unknown;
        }
      ).mergeExtendedObject(
        {
          type: "object",
          description: "User",
          properties: { id: { type: "string" } },
          required: ["id"],
        },
        t.objectExpression([
          t.objectProperty(
            t.identifier("name"),
            t.callExpression(t.memberExpression(t.identifier("z"), t.identifier("string")), []),
          ),
        ]),
      ),
    ).toMatchObject({ description: "User" });
    expect(
      (
        converter as unknown as {
          mergeExtendedObject(base: Record<string, unknown>, shape: t.Node): unknown;
        }
      ).mergeExtendedObject({ type: "string" }, t.objectExpression([])),
    ).toMatchObject({ type: "object" });

    converter.zodSchemas.User = { type: "object", properties: { id: { type: "string" } } };
    expect(
      converter.storeResolvedSchema(
        "User",
        { type: "object", properties: { name: { type: "string" } } },
        "response",
      ),
    ).toBe("UserOutput");
    expect(
      converter.storeResolvedSchema(
        "User",
        { type: "object", properties: { email: { type: "string" } } },
        "body",
      ),
    ).toBe("User");
  });

  it("covers leftover falsy content types, preprocess, and route.tsx discovery", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-zod-content-type-"));
    roots.push(root);
    fs.mkdirSync(path.join(root, "node_modules"), { recursive: true });
    fs.writeFileSync(path.join(root, "route.tsx"), "");
    fs.writeFileSync(path.join(root, "users-api.ts"), "");

    const converter = new ZodSchemaConverter(root, root);
    expect(converter.convertZodSchemaToOpenApi("MissingSchema", "")).toBeNull();
    converter.preprocessSchemaDirectories();
    converter.preprocessSchemaDirectories();
    converter.schemaVariantRefs.set("response:Ghost", "GhostOutput");
    expect(
      (
        converter as unknown as {
          getStoredSchema(name: string, contentType?: string, allowBaseFallback?: boolean): unknown;
        }
      ).getStoredSchema("Ghost", "", false),
    ).toBeNull();

    const routeFiles: string[] = [];
    converter.findRouteFilesInDir(root, routeFiles);
    expect(routeFiles.some((file) => file.endsWith("route.tsx"))).toBe(true);
    expect(routeFiles.some((file) => file.endsWith("users-api.ts"))).toBe(true);
  });

  it("covers leftover processZodObject identifier, computed keys, and spreads", () => {
    const converter = new ZodSchemaConverter("/virtual");
    const processZodObject = converter.processZodObject.bind(converter);

    expect(
      processZodObject(
        t.callExpression(t.memberExpression(t.identifier("z"), t.identifier("object")), []),
      ),
    ).toEqual({ type: "object" });
    expect(
      processZodObject(
        t.callExpression(t.memberExpression(t.identifier("z"), t.identifier("object")), [
          t.numericLiteral(1) as never,
        ]),
      ),
    ).toEqual({ type: "object" });

    converter.resolveObjectSchemaNode = (name: string) =>
      name === "Shape"
        ? t.callExpression(t.memberExpression(t.identifier("z"), t.identifier("object")), [
            t.objectExpression([
              t.objectProperty(
                t.identifier("id"),
                t.callExpression(t.memberExpression(t.identifier("z"), t.identifier("string")), []),
              ),
            ]),
          ])
        : name === "EmptyCall"
          ? t.callExpression(t.memberExpression(t.identifier("z"), t.identifier("object")), [])
          : null;
    converter.resolveConstObjectNode = (name: string) =>
      name === "ConstShape"
        ? t.objectExpression([
            t.objectProperty(
              t.identifier("label"),
              t.callExpression(t.memberExpression(t.identifier("z"), t.identifier("string")), []),
            ),
          ])
        : null;
    converter.resolveLiteralValue = (name: string) => (name === "KEY" ? "nick" : undefined);
    converter.resolveSpreadMembers = () => null;
    converter.convertZodSchemaToOpenApi = () => ({ type: "object" });
    converter.getStoredSchema = (name: string) =>
      name === "UserSchema"
        ? { type: "object", properties: { id: { type: "string" } } }
        : undefined;

    expect(
      processZodObject(
        t.callExpression(t.memberExpression(t.identifier("z"), t.identifier("object")), [
          t.identifier("Shape"),
        ]),
      ),
    ).toMatchObject({
      type: "object",
      properties: { id: { type: "string" } },
    });
    expect(
      processZodObject(
        t.callExpression(t.memberExpression(t.identifier("z"), t.identifier("object")), [
          t.identifier("ConstShape"),
        ]),
      ),
    ).toMatchObject({
      type: "object",
      properties: { label: { type: "string" } },
    });
    expect(
      processZodObject(
        t.callExpression(t.memberExpression(t.identifier("z"), t.identifier("object")), [
          t.identifier("UserSchema"),
        ]),
      ),
    ).toEqual({ $ref: "#/components/schemas/UserSchema" });
    expect(
      processZodObject(
        t.callExpression(t.memberExpression(t.identifier("z"), t.identifier("object")), [
          t.identifier("Missing"),
        ]),
      ),
    ).toEqual({ type: "object" });
    expect(
      processZodObject(
        t.callExpression(t.memberExpression(t.identifier("z"), t.identifier("object")), [
          t.identifier("EmptyCall"),
        ]),
      ),
    ).toEqual({ type: "object" });

    expect(
      processZodObject(
        t.callExpression(t.memberExpression(t.identifier("z"), t.identifier("object")), [
          t.objectExpression([
            t.spreadElement(t.identifier("Base")),
            t.objectProperty(
              t.identifier("KEY"),
              t.callExpression(t.memberExpression(t.identifier("z"), t.identifier("string")), []),
              true,
            ),
            t.objectProperty(
              t.stringLiteral("full-name"),
              t.callExpression(t.memberExpression(t.identifier("z"), t.identifier("string")), []),
            ),
          ]),
        ]),
      ),
    ).toMatchObject({
      type: "object",
      properties: {
        nick: { type: "string" },
        "full-name": { type: "string" },
      },
    });
  });

  it("covers leftover processFileForZodSchema import cache and infer walks", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-zod-process-file-"));
    roots.push(root);
    const schemaFile = path.join(root, "schemas.ts");
    fs.writeFileSync(
      schemaFile,
      [
        'import { z } from "zod";',
        'import { createInsertSchema } from "drizzle-zod";',
        "",
        "export const UserSchema = z.object({ id: z.string() });",
        "export const ExtendedSchema = UserSchema.extend({ nick: z.string() });",
        "function makeSchema() {",
        "  return z.object({ factory: z.string() });",
        "}",
        "export const FactorySchema = makeSchema();",
        "function failFactory() { return 1; }",
        "export const FailedFactorySchema = failFactory();",
        "export const MissingFactorySchema = missingFactory();",
        "export const InsertSchema = createInsertSchema(users);",
        "export type User = z.infer<typeof UserSchema>;",
        "export type EmptyInfer = z.infer;",
        'const ghostNote = "GhostA GhostB";',
        "const LocalSchema = z.object({ local: z.boolean() });",
      ].join("\n"),
    );

    const converter = new ZodSchemaConverter(root);
    converter.processFileForZodSchema(schemaFile, "GhostA");
    converter.processFileForZodSchema(schemaFile, "GhostB");
    converter.processFileForZodSchema(schemaFile, "UserSchema");
    converter.processFileForZodSchema(schemaFile, "ExtendedSchema");
    converter.processFileForZodSchema(schemaFile, "FactorySchema");
    converter.processFileForZodSchema(schemaFile, "FailedFactorySchema");
    converter.processFileForZodSchema(schemaFile, "MissingFactorySchema");
    converter.processFileForZodSchema(schemaFile, "InsertSchema");
    converter.processFileForZodSchema(schemaFile, "LocalSchema");
    converter.processFileForZodSchema(schemaFile, "User");
    converter.processAllSchemasInFile(schemaFile);

    expect(converter.convertZodSchemaToOpenApi("UserSchema")).toMatchObject({ type: "object" });
    expect(converter.convertZodSchemaToOpenApi("FactorySchema")).toMatchObject({
      type: "object",
      properties: { factory: { type: "string" } },
    });
    expect(converter.typeToSchemaMapping.User).toBe("UserSchema");
  });

  it("covers leftover runtime pre-scan, meta-id exports, and extend-ref helpers", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-zod-runtime-leftover-"));
    roots.push(root);
    const schemaFile = path.join(root, "schemas.ts");
    fs.writeFileSync(
      schemaFile,
      [
        'import { z } from "zod";',
        'const KEY = "fullName";',
        "export const UserSchema = z.object({ [KEY]: z.string(), [Date.now()]: z.number() });",
        "export const AliasedSchema = UserSchema.meta({ id: 'AliasedUser' });",
        "export const ExtendedMissing = z.extend({ $ref: true } as never, { extra: z.boolean() });",
      ].join("\n"),
    );

    const runtime = createSharedGenerationRuntime();
    const converter = new ZodSchemaConverter(
      root,
      undefined,
      undefined,
      undefined,
      undefined,
      runtime.schema.zod,
    );
    expect(converter.convertZodSchemaToOpenApi("UserSchema")).toMatchObject({ type: "object" });
    converter.preprocessSchemaDirectories();
    converter.preprocessSchemaDirectories();
    converter.processAllSchemasInFile(schemaFile);
    expect(converter.convertZodSchemaToOpenApi("AliasedSchema")).toBeDefined();

    const helpers = converter as unknown as {
      processZodChain(node: t.CallExpression): Record<string, unknown>;
      mergeExtendedObject(base: Record<string, unknown>, shape: t.Node): Record<string, unknown>;
      applyDeepPartial(schema: Record<string, unknown>): void;
      shouldUseRuntimeExport(node: t.Node): boolean;
      extractMetaIdFromNode(node: t.Node): string | null;
    };

    expect(helpers.processZodChain(t.callExpression(t.identifier("foo"), []))).toEqual({
      type: "object",
    });
    expect(
      helpers.mergeExtendedObject(
        { $ref: "#/components/schemas/MissingBase" },
        t.objectExpression([
          t.objectProperty(
            t.identifier("extra"),
            t.callExpression(t.memberExpression(t.identifier("z"), t.identifier("boolean")), []),
          ),
        ]),
      ),
    ).toMatchObject({ type: "object" });
    expect(helpers.mergeExtendedObject({ type: "string" }, t.identifier("shape"))).toEqual({
      type: "string",
    });
    const sparse = { type: "object", properties: { a: undefined } };
    helpers.applyDeepPartial(sparse);
    expect(
      helpers.shouldUseRuntimeExport(
        t.callExpression(
          t.memberExpression(
            t.memberExpression(t.identifier("z"), t.stringLiteral("coerce"), true),
            t.identifier("string"),
          ),
          [],
        ),
      ),
    ).toBe(false);
    expect(
      helpers.extractMetaIdFromNode(
        t.callExpression(
          t.memberExpression(
            t.callExpression(t.memberExpression(t.identifier("z"), t.identifier("string")), []),
            t.identifier("meta"),
          ),
          [t.objectExpression([t.objectProperty(t.identifier("id"), t.stringLiteral("Doc"))])],
        ),
      ),
    ).toBe("Doc");
  });
});
