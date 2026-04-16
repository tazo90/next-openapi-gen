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
      additionalProperties: true,
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
      exclusiveMinimum: true,
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
});
