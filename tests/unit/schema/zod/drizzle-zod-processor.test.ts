import traverse from "@babel/traverse";
import * as t from "@babel/types";
import { describe, expect, it } from "vitest";

import { DrizzleZodProcessor } from "@workspace/openapi-core/schema/zod/drizzle-zod-processor.js";
import { parseTypeScriptFile } from "@workspace/openapi-core/shared/utils.js";

function processFirstDrizzleCall(code: string, calleeName: string) {
  const ast = parseTypeScriptFile(code);
  let processedSchema: ReturnType<typeof DrizzleZodProcessor.processSchema> | undefined;

  traverse(ast, {
    CallExpression: (path) => {
      if (t.isIdentifier(path.node.callee) && path.node.callee.name === calleeName) {
        processedSchema = DrizzleZodProcessor.processSchema(path.node, {
          currentAST: ast,
        });
      }
    },
  });

  return processedSchema;
}

describe("DrizzleZodProcessor", () => {
  it("recognizes drizzle-zod helper names", () => {
    expect(DrizzleZodProcessor.isDrizzleZodHelper("createInsertSchema")).toBe(true);
    expect(DrizzleZodProcessor.isDrizzleZodHelper("createSelectSchema")).toBe(true);
    expect(DrizzleZodProcessor.isDrizzleZodHelper("createUpdateSchema")).toBe(true);
    expect(DrizzleZodProcessor.isDrizzleZodHelper("createSchema")).toBe(false);
  });

  it("processes refinements, required fields, and chained validations", () => {
    const processedSchema = processFirstDrizzleCall(
      `
        import { createInsertSchema } from "drizzle-zod";

        const schema = createInsertSchema(table, {
          title: (schema) => schema.min(5).max(255).describe("Post title"),
          email: (schema) => schema.email(),
          price: (schema) => schema.positive(),
          excerpt: (schema) => schema.optional(),
          createdAt: (schema) => schema,
        });
      `,
      "createInsertSchema",
    );

    expect(processedSchema).toMatchObject({
      type: "object",
      properties: {
        title: {
          type: "string",
          minLength: 5,
          maxLength: 255,
          description: "Post title",
        },
        email: {
          type: "string",
          format: "email",
        },
        price: {
          type: "number",
          minimum: 0,
          exclusiveMinimum: true,
        },
        excerpt: {
          type: "string",
        },
        createdAt: {
          type: "string",
          format: "date-time",
        },
      },
    });
    expect(processedSchema?.required).toContain("title");
    expect(processedSchema?.required).toContain("email");
    expect(processedSchema?.required).toContain("price");
    expect(processedSchema?.required).not.toContain("excerpt");
  });

  it("returns a generic object when no refinements are available", () => {
    expect(
      processFirstDrizzleCall(
        `
          import { createInsertSchema } from "drizzle-zod";
          const schema = createInsertSchema(table);
        `,
        "createInsertSchema",
      ),
    ).toEqual({ type: "object" });
  });

  it("merges base drizzle table columns for select schemas", () => {
    const processedSchema = processFirstDrizzleCall(
      `
        import { createSelectSchema } from "drizzle-zod";
        import { pgTable, serial, varchar, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";

        const posts = pgTable("posts", {
          id: serial("id").primaryKey(),
          title: varchar("title", { length: 255 }).notNull(),
          excerpt: varchar("excerpt", { length: 500 }),
          content: text("content").notNull(),
          authorId: integer("author_id").notNull(),
          published: boolean("published").default(false).notNull(),
          createdAt: timestamp("created_at").defaultNow().notNull(),
        });

        const schema = createSelectSchema(posts, {
          title: (schema) => schema.describe("Post title"),
          excerpt: (schema) => schema.describe("Post excerpt"),
        });
      `,
      "createSelectSchema",
    );

    expect(processedSchema).toMatchObject({
      type: "object",
      properties: {
        id: {
          type: "integer",
        },
        title: {
          type: "string",
          maxLength: 255,
          description: "Post title",
        },
        excerpt: {
          type: "string",
          maxLength: 500,
          nullable: true,
          description: "Post excerpt",
        },
        content: {
          type: "string",
        },
        authorId: {
          type: "integer",
        },
        published: {
          type: "boolean",
        },
        createdAt: {
          type: "string",
          format: "date-time",
        },
      },
      required: ["id", "title", "excerpt", "content", "authorId", "published", "createdAt"],
    });
  });

  it("covers helper branches for keys, optionality, field mapping, and method application", () => {
    expect(
      (DrizzleZodProcessor as any).extractPropertyKey(
        t.objectProperty(t.identifier("title"), t.identifier("value")),
      ),
    ).toBe("title");
    expect(
      (DrizzleZodProcessor as any).extractPropertyKey(
        t.objectProperty(t.stringLiteral("slug"), t.identifier("value")),
      ),
    ).toBe("slug");
    expect(
      (DrizzleZodProcessor as any).extractPropertyKey(
        t.objectProperty(t.numericLiteral(1), t.identifier("value")),
      ),
    ).toBeNull();

    const nullishCall = parseTypeScriptFile("const field = schema.name.nullish();").program.body[0];
    if (!nullishCall || !t.isVariableDeclaration(nullishCall)) {
      throw new Error("Expected a variable declaration");
    }
    const nullishNode = nullishCall.declarations[0]?.init;
    if (!nullishNode || !t.isCallExpression(nullishNode)) {
      throw new Error("Expected a call expression");
    }

    expect((DrizzleZodProcessor as any).isFieldOptional(nullishNode)).toBe(true);
    expect((DrizzleZodProcessor as any).isFieldOptional(t.identifier("plain"))).toBe(false);

    expect((DrizzleZodProcessor as any).mapFieldTypeToOpenApi("userEmail")).toEqual({
      type: "string",
      format: "email",
    });
    expect((DrizzleZodProcessor as any).mapFieldTypeToOpenApi("avatarUrl")).toEqual({
      type: "string",
      format: "uri",
    });
    expect((DrizzleZodProcessor as any).mapFieldTypeToOpenApi("userId")).toEqual({
      type: "integer",
    });
    expect((DrizzleZodProcessor as any).mapFieldTypeToOpenApi("priceAmount")).toEqual({
      type: "number",
    });
    expect((DrizzleZodProcessor as any).mapFieldTypeToOpenApi("isActive")).toEqual({
      type: "boolean",
    });
    expect((DrizzleZodProcessor as any).mapFieldTypeToOpenApi("createdAt")).toEqual({
      type: "string",
      format: "date-time",
    });
    expect((DrizzleZodProcessor as any).mapFieldTypeToOpenApi("notes")).toEqual({
      type: "string",
    });

    const apply = (
      schema: Record<string, unknown>,
      methodName: string,
      args: t.Expression[] = [],
    ) => (DrizzleZodProcessor as any).applyZodMethod(schema, methodName, args);

    expect(apply({ type: "string" }, "min", [t.numericLiteral(2)])).toMatchObject({ minLength: 2 });
    expect(apply({ type: "integer" }, "max", [t.numericLiteral(5)])).toMatchObject({ maximum: 5 });
    expect(apply({ type: "array" }, "length", [t.numericLiteral(3)])).toMatchObject({
      minItems: 3,
      maxItems: 3,
    });
    expect(apply({ type: "string" }, "email")).toMatchObject({ format: "email" });
    expect(apply({ type: "string" }, "url")).toMatchObject({ format: "uri" });
    expect(apply({ type: "string" }, "uuid")).toMatchObject({ format: "uuid" });
    expect(apply({ type: "string" }, "datetime")).toMatchObject({ format: "date-time" });
    expect(apply({ type: "string" }, "regex", [t.regExpLiteral("a+", "")])).toMatchObject({
      pattern: "a+",
    });
    expect(apply({ type: "integer" }, "positive")).toMatchObject({
      minimum: 0,
      exclusiveMinimum: true,
    });
    expect(apply({ type: "number" }, "nonnegative")).toMatchObject({ minimum: 0 });
    expect(apply({ type: "number" }, "negative")).toMatchObject({
      maximum: 0,
      exclusiveMaximum: true,
    });
    expect(apply({ type: "number" }, "nonpositive")).toMatchObject({ maximum: 0 });
    expect(apply({ type: "number" }, "int")).toMatchObject({ type: "integer" });
    expect(apply({ type: "string" }, "nullable")).toMatchObject({ nullable: true });
    expect(apply({ type: "string" }, "nullish")).toMatchObject({ nullable: true });
    expect(apply({ type: "string" }, "describe", [t.stringLiteral("Helpful")])).toMatchObject({
      description: "Helpful",
    });
    expect(apply({ type: "string" }, "default", [t.stringLiteral("draft")])).toMatchObject({
      default: "draft",
    });
    expect(apply({ type: "number" }, "default", [t.numericLiteral(1)])).toMatchObject({
      default: 1,
    });
    expect(apply({ type: "boolean" }, "default", [t.booleanLiteral(true)])).toMatchObject({
      default: true,
    });
    expect(apply({ type: "number" }, "min", [t.numericLiteral(1)])).toMatchObject({ minimum: 1 });
    expect(apply({ type: "array" }, "min", [t.numericLiteral(2)])).toMatchObject({ minItems: 2 });
    expect(apply({ type: "string" }, "max", [t.numericLiteral(8)])).toMatchObject({ maxLength: 8 });
    expect(apply({ type: "array" }, "max", [t.numericLiteral(4)])).toMatchObject({ maxItems: 4 });
    expect(apply({ type: "string" }, "length", [t.numericLiteral(6)])).toMatchObject({
      minLength: 6,
      maxLength: 6,
    });
    expect(apply({ type: "object" }, "min", [t.numericLiteral(1)])).toEqual({ type: "object" });
    expect(apply({ type: "string" }, "min", [])).toEqual({ type: "string" });
    expect(apply({ type: "string" }, "unknownMethod")).toEqual({ type: "string" });
    expect(
      apply({ type: "string" }, "meta", [
        t.objectExpression([
          t.objectProperty(t.identifier("id"), t.stringLiteral("Field")),
          t.objectProperty(t.stringLiteral("example"), t.stringLiteral("x")),
          t.objectProperty(t.identifier("count"), t.numericLiteral(2)),
          t.objectProperty(t.identifier("ok"), t.booleanLiteral(true)),
          t.objectProperty(t.identifier("empty"), t.nullLiteral()),
          t.objectProperty(
            t.identifier("tags"),
            t.arrayExpression([t.stringLiteral("a"), t.numericLiteral(1)]),
          ),
          t.objectProperty(
            t.identifier("nested"),
            t.objectExpression([t.objectProperty(t.identifier("n"), t.numericLiteral(1))]),
          ),
        ]),
      ]),
    ).toMatchObject({
      type: "string",
      example: "x",
      count: 2,
      ok: true,
      empty: null,
      tags: ["a", 1],
      nested: { n: 1 },
    });
    expect(apply({ type: "string" }, "meta", [t.identifier("nope")])).toEqual({ type: "string" });
    expect(
      apply({ type: "string" }, "meta", [
        t.objectExpression([t.spreadElement(t.identifier("rest"))]),
      ]),
    ).toEqual({ type: "string" });
    expect(
      apply({ type: "string" }, "meta", [
        t.objectExpression([
          t.objectProperty(
            t.identifier("items"),
            t.arrayExpression([t.spreadElement(t.identifier("x"))]),
          ),
        ]),
      ]),
    ).toEqual({ type: "string" });
  });

  it("covers leftover table resolution and refinement branches", () => {
    expect(
      processFirstDrizzleCall(
        `
          import { createInsertSchema } from "drizzle-zod";
          const schema = createInsertSchema(missingTable, {
            title: (schema) => schema.min(1),
            1: (schema) => schema,
          });
        `,
        "createInsertSchema",
      ),
    ).toMatchObject({
      type: "object",
      properties: { title: expect.objectContaining({ type: "string" }) },
    });

    expect(
      processFirstDrizzleCall(
        `
          import { createUpdateSchema } from "drizzle-zod";
          const schema = createUpdateSchema(pgTable("posts", { title: varchar("title") }), {
            title(schema) { return schema.max(10); },
          });
        `,
        "createUpdateSchema",
      ),
    ).toMatchObject({ type: "object" });

    expect(
      processFirstDrizzleCall(
        `
          import { createSelectSchema } from "drizzle-zod";
          const schema = createSelectSchema(pgTable("empty"));
        `,
        "createSelectSchema",
      ),
    ).toEqual({ type: "object" });

    expect(
      DrizzleZodProcessor.processSchema(t.callExpression(t.identifier("createSchema"), [])),
    ).toEqual({
      type: "object",
    });

    expect(
      processFirstDrizzleCall(
        `
          import { createSelectSchema } from "drizzle-zod";
          const schema = createSelectSchema(pgTable("posts", {
            title: varchar("title"),
          }), {
            title: (schema) => schema.min(1),
          });
        `,
        "createSelectSchema",
      ),
    ).toMatchObject({
      type: "object",
      properties: { title: expect.any(Object) },
      required: expect.arrayContaining(["title"]),
    });

    expect(
      DrizzleZodProcessor.processSchema(
        t.callExpression(t.identifier("createSelectSchema"), [
          t.identifier("missingTable"),
          t.objectExpression([
            t.objectProperty(
              t.identifier("title"),
              t.arrowFunctionExpression([t.identifier("schema")], t.identifier("schema")),
            ),
          ]),
        ]),
      ),
    ).toMatchObject({
      type: "object",
      properties: { title: expect.any(Object) },
    });
  });

  it("covers leftover pgTable column, refinement, and imported-table branches", () => {
    expect(
      processFirstDrizzleCall(
        `
          import { createInsertSchema } from "drizzle-zod";
          const schema = createInsertSchema(pgTable("posts", {
            title: varchar("title").notNull(),
            createdAt: timestamp("created_at").defaultNow(),
            id: serial("id").primaryKey(),
            notes: text("notes"),
            computed: columns["title"],
            skip() {},
          }));
        `,
        "createInsertSchema",
      ),
    ).toMatchObject({
      type: "object",
      properties: expect.objectContaining({
        title: expect.objectContaining({ type: "string" }),
        createdAt: expect.any(Object),
        id: expect.any(Object),
      }),
    });

    expect(
      processFirstDrizzleCall(
        `
          import { createUpdateSchema } from "drizzle-zod";
          const schema = createUpdateSchema(pgTable("posts", {
            title: varchar("title").notNull(),
          }));
        `,
        "createUpdateSchema",
      ),
    ).toMatchObject({ type: "object" });

    expect(
      processFirstDrizzleCall(
        `
          import { createInsertSchema } from "drizzle-zod";
          const schema = createInsertSchema(notATable, {
            title: (schema) => schema.min(1),
          });
        `,
        "createInsertSchema",
      ),
    ).toMatchObject({ type: "object" });
  });

  it("covers leftover column factories, refinements, and imported tables", () => {
    expect(
      DrizzleZodProcessor.processSchema(
        t.callExpression(
          t.memberExpression(t.identifier("dz"), t.identifier("createInsertSchema")),
          [],
        ),
      ),
    ).toEqual({ type: "object" });

    const local = processFirstDrizzleCall(
      `
        import { createInsertSchema } from "drizzle-zod";
        export const posts = pgTable("posts", {
          id: serial("id").primaryKey(),
          age: integer("age").notNull(),
          small: smallint("small"),
          big: bigint("big"),
          num: numeric("num"),
          realVal: real("real"),
          dp: doublePrecision("dp"),
          dec: decimal("dec"),
          flag: boolean("flag"),
          ts: timestamp("ts").defaultNow(),
          dt: datetime("dt"),
          day: date("day"),
          body: text("body"),
          title: varchar("title", { length: 255 }).notNull(),
          code: char("code", { length: 2 }),
          kind: textEnum("kind"),
          role: pgEnum("role"),
          uid: uuid("uid"),
          skip: unknownFactory("x"),
          titled: varchar("titled")["notNull"](),
        });
        const schema = createInsertSchema(posts, {
          contentUuid: (schema) => schema,
          title: (schema) => schema.length(5).url().describe("Title"),
          email: (schema) => schema.uuid(),
          price: (schema) => schema.min(1).max(10).nonnegative().int(),
          count: (schema) => schema.negative().nonpositive(),
          excerpt: (schema) => schema.datetime().nullable(),
          notes: (schema) =>
            schema.nullish().regex(/abc/).default("x").meta({ id: "n", example: "hi" }),
          flag: (schema) => schema.default(true),
          age: (schema) => schema.default(1),
          homepageUrl: (schema) => schema,
          userUuid: (schema) => schema,
          itemCount: (schema) => schema,
          amount: (schema) => schema,
          isActive: (schema) => schema,
          createdAt: (schema) => schema,
          unknownField: (schema) => schema,
          "full-name": (schema) => schema.min(COUNT),
          notes2: (schema) => schema.regex(PATTERN).meta({ ...rest }).default(),
        });
      `,
      "createInsertSchema",
    );
    expect(local?.properties?.title).toMatchObject({ type: "string" });
    expect(local?.properties?.uid).toMatchObject({ format: "uuid" });
    expect(local?.properties?.contentUuid).toMatchObject({ format: "uuid" });
    expect(local?.properties?.age).toMatchObject({ type: "integer" });
    expect(local?.properties?.num).toMatchObject({ type: "number" });
    expect(local?.properties?.day).toMatchObject({ format: "date" });

    const importedAst = parseTypeScriptFile(`
      export const users = pgTable("users", {
        id: serial("id"),
        title: varchar("title").notNull(),
      });
    `);
    const ast = parseTypeScriptFile(`
      import { createInsertSchema } from "drizzle-zod";
      import { users } from "./tables";
      const schema = createInsertSchema(users);
    `);
    let call: t.CallExpression | undefined;
    traverse(ast, {
      CallExpression: (path) => {
        if (t.isIdentifier(path.node.callee, { name: "createInsertSchema" })) {
          call = path.node;
        }
      },
    });
    const imported = DrizzleZodProcessor.processSchema(call!, {
      currentAST: ast,
      currentFilePath: "/tmp/schema.ts",
      importedModules: { users: "./tables" },
      resolveImportPath: () => "/tmp/tables.ts",
      parseFileWithCache: () => importedAst,
    });
    expect(imported).toMatchObject({
      type: "object",
      properties: expect.objectContaining({ id: expect.any(Object) }),
    });
    expect(
      DrizzleZodProcessor.processSchema(call!, {
        currentAST: ast,
        currentFilePath: "/tmp/schema.ts",
        importedModules: { users: "./tables" },
        resolveImportPath: () => "/tmp/tables.ts",
        parseFileWithCache: () => importedAst,
      }),
    ).toMatchObject({ type: "object" });
    expect(
      DrizzleZodProcessor.processSchema(call!, {
        currentAST: ast,
        currentFilePath: "/tmp/schema.ts",
        importedModules: { users: "db/schema" },
        parseFileWithCache: () => undefined,
      }),
    ).toMatchObject({ type: "object" });

    expect(
      processFirstDrizzleCall(
        `
          import { createUpdateSchema } from "drizzle-zod";
          const schema = createUpdateSchema(pgTable("posts", {
            title: varchar("title").notNull(),
          }), {
            title: (schema) => schema.optional(),
            skip() {},
          });
        `,
        "createUpdateSchema",
      ),
    ).toMatchObject({ type: "object" });
  });
});
