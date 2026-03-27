import traverse from "@babel/traverse";
import * as t from "@babel/types";
import { describe, expect, it } from "vitest";

import { DrizzleZodProcessor } from "@next-openapi-gen/schema/zod/drizzle-zod-processor.js";
import { parseTypeScriptFile } from "@next-openapi-gen/shared/utils.js";

function processFirstDrizzleCall(code: string, calleeName: string) {
  const ast = parseTypeScriptFile(code);
  let processedSchema: ReturnType<typeof DrizzleZodProcessor.processSchema> | undefined;

  traverse(ast, {
    CallExpression: (path) => {
      if (t.isIdentifier(path.node.callee) && path.node.callee.name === calleeName) {
        processedSchema = DrizzleZodProcessor.processSchema(path.node);
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
          title: (schema) => schema.title.min(5).max(255).describe("Post title"),
          email: (schema) => schema.email.email(),
          price: (schema) => schema.price.positive(),
          excerpt: (schema) => schema.excerpt.optional(),
          createdAt: (schema) => schema.createdAt,
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
});
