import { describe, it, expect } from "vitest";
import { DrizzleZodProcessor } from "../src/lib/drizzle-zod-processor.js";
import { parseTypeScriptFile } from "../src/lib/utils.js";
import traverse from "@babel/traverse";
import * as t from "@babel/types";

// Integration tests focusing on end-to-end drizzle-zod schema conversion
describe("Drizzle-Zod Integration", () => {
  describe("Complex schema conversion", () => {
    it("should convert complete user schema with all field types", () => {
      const code = `
        import { createInsertSchema } from 'drizzle-zod';
        import { users } from './schema';

        export const CreateUserSchema = createInsertSchema(users, {
          id: (schema) => schema.id,
          username: (schema) => schema.username.min(3).max(20),
          email: (schema) => schema.email.email(),
          age: (schema) => schema.age.positive(),
          bio: (schema) => schema.bio.max(500).optional(),
          isActive: (schema) => schema.isActive,
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

      expect(processedSchema).toBeDefined();
      expect(processedSchema.type).toBe("object");

      // Verify all fields
      expect(Object.keys(processedSchema.properties).length).toBe(7);

      // Integer field
      expect(processedSchema.properties.id.type).toBe("integer");

      // String with constraints
      expect(processedSchema.properties.username.type).toBe("string");
      expect(processedSchema.properties.username.minLength).toBe(3);
      expect(processedSchema.properties.username.maxLength).toBe(20);

      // Email
      expect(processedSchema.properties.email.type).toBe("string");
      expect(processedSchema.properties.email.format).toBe("email");

      // Number with constraint
      expect(processedSchema.properties.age.type).toBe("integer");
      expect(processedSchema.properties.age.minimum).toBe(0);
      expect(processedSchema.properties.age.exclusiveMinimum).toBe(true);

      // Optional string
      expect(processedSchema.properties.bio.type).toBe("string");
      expect(processedSchema.properties.bio.maxLength).toBe(500);

      // Boolean
      expect(processedSchema.properties.isActive.type).toBe("boolean");

      // DateTime
      expect(processedSchema.properties.createdAt.type).toBe("string");
      expect(processedSchema.properties.createdAt.format).toBe("date-time");

      // Required fields
      expect(processedSchema.required).toContain("id");
      expect(processedSchema.required).toContain("username");
      expect(processedSchema.required).toContain("email");
      expect(processedSchema.required).toContain("age");
      expect(processedSchema.required).not.toContain("bio");
      expect(processedSchema.required).toContain("isActive");
      expect(processedSchema.required).toContain("createdAt");
    });

    it("should convert product schema with pricing and inventory", () => {
      const code = `
        import { createInsertSchema } from 'drizzle-zod';
        import { products } from './schema';

        export const CreateProductSchema = createInsertSchema(products, {
          sku: (schema) => schema.sku.min(5).max(20),
          name: (schema) => schema.name.min(1).max(255),
          description: (schema) => schema.description.max(1000).optional(),
          price: (schema) => schema.price.positive(),
          salePrice: (schema) => schema.salePrice.positive().optional(),
          stock: (schema) => schema.stock.nonnegative(),
          isAvailable: (schema) => schema.isAvailable,
          websiteUrl: (schema) => schema.websiteUrl.url().optional(),
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

      // SKU
      expect(processedSchema.properties.sku.minLength).toBe(5);
      expect(processedSchema.properties.sku.maxLength).toBe(20);

      // Pricing
      expect(processedSchema.properties.price.type).toBe("number");
      expect(processedSchema.properties.price.minimum).toBe(0);
      expect(processedSchema.properties.salePrice.type).toBe("number");

      // Inventory
      expect(processedSchema.properties.stock.type).toBe("integer");
      expect(processedSchema.properties.stock.minimum).toBe(0);
      expect(processedSchema.properties.stock.exclusiveMinimum).toBeUndefined();

      // Optional fields
      expect(processedSchema.required).not.toContain("description");
      expect(processedSchema.required).not.toContain("salePrice");
      expect(processedSchema.required).not.toContain("websiteUrl");

      // URL format
      expect(processedSchema.properties.websiteUrl.format).toBe("uri");
    });
  });

  describe("All drizzle-zod helper functions", () => {
    it("should process createSelectSchema", () => {
      const code = `
        import { createSelectSchema } from 'drizzle-zod';
        import { users } from './schema';

        export const SelectUserSchema = createSelectSchema(users, {
          email: (schema) => schema.email.email(),
        });
      `;

      const ast = parseTypeScriptFile(code);
      let processedSchema: any;

      traverse(ast, {
        CallExpression: (path: any) => {
          if (
            t.isIdentifier(path.node.callee) &&
            path.node.callee.name === "createSelectSchema"
          ) {
            processedSchema = DrizzleZodProcessor.processSchema(path.node);
          }
        },
      });

      expect(processedSchema).toBeDefined();
      expect(processedSchema.properties.email.format).toBe("email");
    });

    it("should process createUpdateSchema", () => {
      const code = `
        import { createUpdateSchema } from 'drizzle-zod';
        import { users } from './schema';

        export const UpdateUserSchema = createUpdateSchema(users, {
          username: (schema) => schema.username.min(3),
        });
      `;

      const ast = parseTypeScriptFile(code);
      let processedSchema: any;

      traverse(ast, {
        CallExpression: (path: any) => {
          if (
            t.isIdentifier(path.node.callee) &&
            path.node.callee.name === "createUpdateSchema"
          ) {
            processedSchema = DrizzleZodProcessor.processSchema(path.node);
          }
        },
      });

      expect(processedSchema).toBeDefined();
      expect(processedSchema.properties.username.minLength).toBe(3);
    });
  });

  describe("Real-world blog example", () => {
    it("should convert post schema from next15-app-drizzle-zod example", () => {
      const code = `
        import { createInsertSchema } from 'drizzle-zod';
        import { posts } from '../db/schema';

        export const CreatePostSchema = createInsertSchema(posts, {
          title: (schema) => schema.title.min(5).max(255).describe('Post title'),
          content: (schema) => schema.content.min(10).describe('Post content'),
          excerpt: (schema) => schema.excerpt.max(500).optional().describe('Short excerpt'),
          authorId: (schema) => schema.authorId.describe('Author ID'),
          categoryId: (schema) => schema.categoryId.optional().describe('Category ID'),
          published: (schema) => schema.published.describe('Publication status'),
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

      // Title constraints and description
      expect(processedSchema.properties.title.minLength).toBe(5);
      expect(processedSchema.properties.title.maxLength).toBe(255);
      expect(processedSchema.properties.title.description).toBe("Post title");

      // Content constraints
      expect(processedSchema.properties.content.minLength).toBe(10);
      expect(processedSchema.properties.content.description).toBe(
        "Post content"
      );

      // Optional excerpt
      expect(processedSchema.properties.excerpt.maxLength).toBe(500);
      expect(processedSchema.properties.excerpt.description).toBe(
        "Short excerpt"
      );
      expect(processedSchema.required).not.toContain("excerpt");

      // IDs
      expect(processedSchema.properties.authorId.type).toBe("integer");
      expect(processedSchema.properties.categoryId.type).toBe("integer");
      expect(processedSchema.required).toContain("authorId");
      expect(processedSchema.required).not.toContain("categoryId");

      // Boolean
      expect(processedSchema.properties.published.type).toBe("boolean");
      expect(processedSchema.properties.published.description).toBe(
        "Publication status"
      );
    });
  });
});
