import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import * as t from "@babel/types";
import { afterEach, describe, expect, it } from "vitest";

import { parseTypeScriptFile } from "@next-openapi-gen/shared/utils.js";
import { ZodSchemaConverter } from "@next-openapi-gen/schema/zod/zod-converter.js";

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
    const converter = new ZodSchemaConverter(process.cwd());
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
});
