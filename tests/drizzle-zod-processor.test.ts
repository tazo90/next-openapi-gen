import { describe, it, expect } from "vitest";
import { DrizzleZodProcessor } from "../src/lib/drizzle-zod-processor.js";
import { parseTypeScriptFile } from "../src/lib/utils.js";
import traverse from "@babel/traverse";
import * as t from "@babel/types";

describe("DrizzleZodProcessor", () => {
  describe("isDrizzleZodHelper", () => {
    it("should recognize createInsertSchema as drizzle-zod helper", () => {
      expect(DrizzleZodProcessor.isDrizzleZodHelper("createInsertSchema")).toBe(
        true
      );
    });

    it("should recognize createSelectSchema as drizzle-zod helper", () => {
      expect(DrizzleZodProcessor.isDrizzleZodHelper("createSelectSchema")).toBe(
        true
      );
    });

    it("should recognize createUpdateSchema as drizzle-zod helper", () => {
      expect(DrizzleZodProcessor.isDrizzleZodHelper("createUpdateSchema")).toBe(
        true
      );
    });

    it("should not recognize non-drizzle-zod functions", () => {
      expect(DrizzleZodProcessor.isDrizzleZodHelper("createSchema")).toBe(
        false
      );
      expect(DrizzleZodProcessor.isDrizzleZodHelper("z.object")).toBe(false);
      expect(DrizzleZodProcessor.isDrizzleZodHelper("randomFunction")).toBe(
        false
      );
    });
  });

  describe("processSchema", () => {
    it("should process basic drizzle-zod schema with refinements", () => {
      const code = `
        import { createInsertSchema } from 'drizzle-zod';
        
        const schema = createInsertSchema(table, {
          title: (schema) => schema.title.min(5).max(255),
          content: (schema) => schema.content.min(10),
        });
      `;

      const ast = parseTypeScriptFile(code);
      let processedSchema: any;

      traverse(ast, {
        CallExpression: (path: any) => {
          if (
            t.isIdentifier(path.node.callee) &&
            path.node.callee.name === "createInsertSchema"
          ) {
            processedSchema = DrizzleZodProcessor.processSchema(path.node);
          }
        },
      });

      expect(processedSchema).toBeDefined();
      expect(processedSchema?.type).toBe("object");
      expect(processedSchema?.properties).toBeDefined();
      expect(processedSchema?.properties?.title).toBeDefined();
      expect(processedSchema?.properties?.content).toBeDefined();
    });

    it("should detect required fields (non-optional)", () => {
      const code = `
        const schema = createInsertSchema(table, {
          title: (schema) => schema.title.min(5),
          description: (schema) => schema.description.optional(),
        });
      `;

      const ast = parseTypeScriptFile(code);
      let processedSchema: any;

      traverse(ast, {
        CallExpression: (path: any) => {
          if (
            t.isIdentifier(path.node.callee) &&
            path.node.callee.name === "createInsertSchema"
          ) {
            processedSchema = DrizzleZodProcessor.processSchema(path.node);
          }
        },
      });

      expect(processedSchema?.required).toBeDefined();
      expect(processedSchema?.required).toContain("title");
      expect(processedSchema?.required).not.toContain("description");
    });

    it("should handle schema with no refinements", () => {
      const code = `
        const schema = createInsertSchema(table);
      `;

      const ast = parseTypeScriptFile(code);
      let processedSchema: any;

      traverse(ast, {
        CallExpression: (path: any) => {
          if (
            t.isIdentifier(path.node.callee) &&
            path.node.callee.name === "createInsertSchema"
          ) {
            processedSchema = DrizzleZodProcessor.processSchema(path.node);
          }
        },
      });

      expect(processedSchema).toBeDefined();
      expect(processedSchema?.type).toBe("object");
      expect(Object.keys(processedSchema?.properties || {}).length).toBe(0);
    });

    it("should extract min/max constraints for strings", () => {
      const code = `
        const schema = createInsertSchema(table, {
          title: (schema) => schema.title.min(5).max(255),
        });
      `;

      const ast = parseTypeScriptFile(code);
      let processedSchema: any;

      traverse(ast, {
        CallExpression: (path: any) => {
          if (
            t.isIdentifier(path.node.callee) &&
            path.node.callee.name === "createInsertSchema"
          ) {
            processedSchema = DrizzleZodProcessor.processSchema(path.node);
          }
        },
      });

      expect(processedSchema?.properties?.title).toBeDefined();
      expect(processedSchema?.properties?.title?.minLength).toBe(5);
      expect(processedSchema?.properties?.title?.maxLength).toBe(255);
    });

    it("should extract description from .describe() method", () => {
      const code = `
        const schema = createInsertSchema(table, {
          title: (schema) => schema.title.describe("Post title"),
        });
      `;

      const ast = parseTypeScriptFile(code);
      let processedSchema: any;

      traverse(ast, {
        CallExpression: (path: any) => {
          if (
            t.isIdentifier(path.node.callee) &&
            path.node.callee.name === "createInsertSchema"
          ) {
            processedSchema = DrizzleZodProcessor.processSchema(path.node);
          }
        },
      });

      expect(processedSchema?.properties?.title?.description).toBe(
        "Post title"
      );
    });
  });

  describe("Field type mapping", () => {
    it("should map common string field names correctly", () => {
      const code = `
        const schema = createInsertSchema(table, {
          title: (schema) => schema.title,
          name: (schema) => schema.name,
          email: (schema) => schema.email,
          url: (schema) => schema.url,
        });
      `;

      const ast = parseTypeScriptFile(code);
      let processedSchema: any;

      traverse(ast, {
        CallExpression: (path: any) => {
          if (
            t.isIdentifier(path.node.callee) &&
            path.node.callee.name === "createInsertSchema"
          ) {
            processedSchema = DrizzleZodProcessor.processSchema(path.node);
          }
        },
      });

      expect(processedSchema?.properties?.title?.type).toBe("string");
      expect(processedSchema?.properties?.name?.type).toBe("string");
      expect(processedSchema?.properties?.email?.type).toBe("string");
      expect(processedSchema?.properties?.email?.format).toBe("email");
      expect(processedSchema?.properties?.url?.type).toBe("string");
    });

    it("should map integer field names correctly", () => {
      const code = `
        const schema = createInsertSchema(table, {
          id: (schema) => schema.id,
          count: (schema) => schema.count,
          age: (schema) => schema.age,
        });
      `;

      const ast = parseTypeScriptFile(code);
      let processedSchema: any;

      traverse(ast, {
        CallExpression: (path: any) => {
          if (
            t.isIdentifier(path.node.callee) &&
            path.node.callee.name === "createInsertSchema"
          ) {
            processedSchema = DrizzleZodProcessor.processSchema(path.node);
          }
        },
      });

      expect(processedSchema?.properties?.id?.type).toBe("integer");
      expect(processedSchema?.properties?.count?.type).toBe("integer");
      expect(processedSchema?.properties?.age?.type).toBe("integer");
    });

    it("should map number field names correctly", () => {
      const code = `
        const schema = createInsertSchema(table, {
          price: (schema) => schema.price,
          amount: (schema) => schema.amount,
        });
      `;

      const ast = parseTypeScriptFile(code);
      let processedSchema: any;

      traverse(ast, {
        CallExpression: (path: any) => {
          if (
            t.isIdentifier(path.node.callee) &&
            path.node.callee.name === "createInsertSchema"
          ) {
            processedSchema = DrizzleZodProcessor.processSchema(path.node);
          }
        },
      });

      expect(processedSchema?.properties?.price?.type).toBe("number");
      expect(processedSchema?.properties?.amount?.type).toBe("number");
    });

    it("should map boolean field names correctly", () => {
      const code = `
        const schema = createInsertSchema(table, {
          isPublished: (schema) => schema.isPublished,
          active: (schema) => schema.active,
          hasAccess: (schema) => schema.hasAccess,
        });
      `;

      const ast = parseTypeScriptFile(code);
      let processedSchema: any;

      traverse(ast, {
        CallExpression: (path: any) => {
          if (
            t.isIdentifier(path.node.callee) &&
            path.node.callee.name === "createInsertSchema"
          ) {
            processedSchema = DrizzleZodProcessor.processSchema(path.node);
          }
        },
      });

      expect(processedSchema?.properties?.isPublished?.type).toBe("boolean");
      expect(processedSchema?.properties?.active?.type).toBe("boolean");
      expect(processedSchema?.properties?.hasAccess?.type).toBe("boolean");
    });

    it("should map date/time field names correctly", () => {
      const code = `
        const schema = createInsertSchema(table, {
          createdAt: (schema) => schema.createdAt,
          updatedAt: (schema) => schema.updatedAt,
          date: (schema) => schema.date,
        });
      `;

      const ast = parseTypeScriptFile(code);
      let processedSchema: any;

      traverse(ast, {
        CallExpression: (path: any) => {
          if (
            t.isIdentifier(path.node.callee) &&
            path.node.callee.name === "createInsertSchema"
          ) {
            processedSchema = DrizzleZodProcessor.processSchema(path.node);
          }
        },
      });

      expect(processedSchema?.properties?.createdAt?.type).toBe("string");
      expect(processedSchema?.properties?.createdAt?.format).toBe("date-time");
      expect(processedSchema?.properties?.updatedAt?.type).toBe("string");
      expect(processedSchema?.properties?.updatedAt?.format).toBe("date-time");
      expect(processedSchema?.properties?.date?.type).toBe("string");
      expect(processedSchema?.properties?.date?.format).toBe("date-time");
    });
  });

  describe("Validation methods", () => {
    it("should apply email format", () => {
      const code = `
        const schema = createInsertSchema(table, {
          email: (schema) => schema.email.email(),
        });
      `;

      const ast = parseTypeScriptFile(code);
      let processedSchema: any;

      traverse(ast, {
        CallExpression: (path: any) => {
          if (
            t.isIdentifier(path.node.callee) &&
            path.node.callee.name === "createInsertSchema"
          ) {
            processedSchema = DrizzleZodProcessor.processSchema(path.node);
          }
        },
      });

      expect(processedSchema?.properties?.email?.format).toBe("email");
    });

    it("should apply url format", () => {
      const code = `
        const schema = createInsertSchema(table, {
          website: (schema) => schema.website.url(),
        });
      `;

      const ast = parseTypeScriptFile(code);
      let processedSchema: any;

      traverse(ast, {
        CallExpression: (path: any) => {
          if (
            t.isIdentifier(path.node.callee) &&
            path.node.callee.name === "createInsertSchema"
          ) {
            processedSchema = DrizzleZodProcessor.processSchema(path.node);
          }
        },
      });

      expect(processedSchema?.properties?.website?.format).toBe("uri");
    });

    it("should apply uuid format", () => {
      const code = `
        const schema = createInsertSchema(table, {
          id: (schema) => schema.id.uuid(),
        });
      `;

      const ast = parseTypeScriptFile(code);
      let processedSchema: any;

      traverse(ast, {
        CallExpression: (path: any) => {
          if (
            t.isIdentifier(path.node.callee) &&
            path.node.callee.name === "createInsertSchema"
          ) {
            processedSchema = DrizzleZodProcessor.processSchema(path.node);
          }
        },
      });

      expect(processedSchema?.properties?.id?.format).toBe("uuid");
    });

    it("should handle chained validation methods", () => {
      const code = `
        const schema = createInsertSchema(table, {
          title: (schema) => schema.title.min(5).max(255).describe("Title"),
        });
      `;

      const ast = parseTypeScriptFile(code);
      let processedSchema: any;

      traverse(ast, {
        CallExpression: (path: any) => {
          if (
            t.isIdentifier(path.node.callee) &&
            path.node.callee.name === "createInsertSchema"
          ) {
            processedSchema = DrizzleZodProcessor.processSchema(path.node);
          }
        },
      });

      expect(processedSchema?.properties?.title?.minLength).toBe(5);
      expect(processedSchema?.properties?.title?.maxLength).toBe(255);
      expect(processedSchema?.properties?.title?.description).toBe("Title");
    });

    it("should handle positive constraint for numbers", () => {
      const code = `
        const schema = createInsertSchema(table, {
          price: (schema) => schema.price.positive(),
        });
      `;

      const ast = parseTypeScriptFile(code);
      let processedSchema: any;

      traverse(ast, {
        CallExpression: (path: any) => {
          if (
            t.isIdentifier(path.node.callee) &&
            path.node.callee.name === "createInsertSchema"
          ) {
            processedSchema = DrizzleZodProcessor.processSchema(path.node);
          }
        },
      });

      expect(processedSchema?.properties?.price?.minimum).toBe(0);
      expect(processedSchema?.properties?.price?.exclusiveMinimum).toBe(true);
    });

    it("should handle nonnegative constraint for numbers", () => {
      const code = `
        const schema = createInsertSchema(table, {
          count: (schema) => schema.count.nonnegative(),
        });
      `;

      const ast = parseTypeScriptFile(code);
      let processedSchema: any;

      traverse(ast, {
        CallExpression: (path: any) => {
          if (
            t.isIdentifier(path.node.callee) &&
            path.node.callee.name === "createInsertSchema"
          ) {
            processedSchema = DrizzleZodProcessor.processSchema(path.node);
          }
        },
      });

      expect(processedSchema?.properties?.count?.minimum).toBe(0);
      expect(
        processedSchema?.properties?.count?.exclusiveMinimum
      ).toBeUndefined();
    });
  });

  describe("Optional fields detection", () => {
    it("should detect optional() modifier", () => {
      const code = `
        const schema = createInsertSchema(table, {
          description: (schema) => schema.description.optional(),
        });
      `;

      const ast = parseTypeScriptFile(code);
      let processedSchema: any;

      traverse(ast, {
        CallExpression: (path: any) => {
          if (
            t.isIdentifier(path.node.callee) &&
            path.node.callee.name === "createInsertSchema"
          ) {
            processedSchema = DrizzleZodProcessor.processSchema(path.node);
          }
        },
      });

      expect(processedSchema?.required).not.toContain("description");
    });

    it("should detect nullable() modifier", () => {
      const code = `
        const schema = createInsertSchema(table, {
          bio: (schema) => schema.bio.nullable(),
        });
      `;

      const ast = parseTypeScriptFile(code);
      let processedSchema: any;

      traverse(ast, {
        CallExpression: (path: any) => {
          if (
            t.isIdentifier(path.node.callee) &&
            path.node.callee.name === "createInsertSchema"
          ) {
            processedSchema = DrizzleZodProcessor.processSchema(path.node);
          }
        },
      });

      // nullable means T | null — field IS required but can be null
      expect(processedSchema?.required).toContain("bio");
      expect(processedSchema?.properties?.bio?.nullable).toBe(true);
    });

    it("should detect nullish() modifier", () => {
      const code = `
        const schema = createInsertSchema(table, {
          metadata: (schema) => schema.metadata.nullish(),
        });
      `;

      const ast = parseTypeScriptFile(code);
      let processedSchema: any;

      traverse(ast, {
        CallExpression: (path: any) => {
          if (
            t.isIdentifier(path.node.callee) &&
            path.node.callee.name === "createInsertSchema"
          ) {
            processedSchema = DrizzleZodProcessor.processSchema(path.node);
          }
        },
      });

      expect(processedSchema?.required).not.toContain("metadata");
    });

    it("should detect optional in chain", () => {
      const code = `
        const schema = createInsertSchema(table, {
          excerpt: (schema) => schema.excerpt.max(500).optional(),
        });
      `;

      const ast = parseTypeScriptFile(code);
      let processedSchema: any;

      traverse(ast, {
        CallExpression: (path: any) => {
          if (
            t.isIdentifier(path.node.callee) &&
            path.node.callee.name === "createInsertSchema"
          ) {
            processedSchema = DrizzleZodProcessor.processSchema(path.node);
          }
        },
      });

      expect(processedSchema?.required).not.toContain("excerpt");
      expect(processedSchema?.properties?.excerpt?.maxLength).toBe(500);
    });
  });

  describe("Complex schemas", () => {
    it("should handle multiple fields with different types", () => {
      const code = `
        const schema = createInsertSchema(table, {
          id: (schema) => schema.id,
          title: (schema) => schema.title.min(5).max(255),
          price: (schema) => schema.price.positive(),
          published: (schema) => schema.published.optional(),
          createdAt: (schema) => schema.createdAt,
        });
      `;

      const ast = parseTypeScriptFile(code);
      let processedSchema: any;

      traverse(ast, {
        CallExpression: (path: any) => {
          if (
            t.isIdentifier(path.node.callee) &&
            path.node.callee.name === "createInsertSchema"
          ) {
            processedSchema = DrizzleZodProcessor.processSchema(path.node);
          }
        },
      });

      expect(Object.keys(processedSchema?.properties || {}).length).toBe(5);
      expect(processedSchema?.properties?.id?.type).toBe("integer");
      expect(processedSchema?.properties?.title?.type).toBe("string");
      expect(processedSchema?.properties?.price?.type).toBe("number");
      expect(processedSchema?.properties?.published?.type).toBe("boolean");
      expect(processedSchema?.properties?.createdAt?.type).toBe("string");

      expect(processedSchema?.required).toContain("id");
      expect(processedSchema?.required).toContain("title");
      expect(processedSchema?.required).toContain("price");
      expect(processedSchema?.required).not.toContain("published");
      expect(processedSchema?.required).toContain("createdAt");
    });
  });
});
