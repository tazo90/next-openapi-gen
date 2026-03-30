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
  });
});
