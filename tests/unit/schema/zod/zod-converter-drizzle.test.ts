import { describe, expect, it } from "vitest";

import { ZodSchemaConverter } from "@workspace/openapi-core/schema/zod/zod-converter.js";

describe("ZodSchemaConverter drizzle-zod support", () => {
  it("expands factory-generated pagination schemas", () => {
    const converter = new ZodSchemaConverter("apps/next-app-zod/src/schemas");
    const result = converter.convertZodSchemaToOpenApi("PaginatedUsersSchema");

    expect(result).not.toBeNull();
    expect(result).toMatchObject({
      type: "object",
      properties: {
        data: {
          type: "array",
        },
        pagination: {
          allOf: [{ $ref: expect.stringContaining("PaginationMeta") }],
          description: "Pagination metadata",
        },
      },
    });
    expect(converter.zodSchemas["PaginationMeta"]).toBeDefined();
  });

  it("supports alternate factory patterns and caches discovered factories", () => {
    const converter = new ZodSchemaConverter("apps/next-app-zod/src/schemas");

    const alternativeResult = converter.convertZodSchemaToOpenApi(
      "PaginatedUsersAlternativeSchema",
    );
    const envelopeResult = converter.convertZodSchemaToOpenApi("UserEnvelopeSchema");

    expect(alternativeResult).not.toBeNull();
    expect(alternativeResult?.properties).toHaveProperty("items");
    expect(alternativeResult?.properties).toHaveProperty("meta");

    expect(envelopeResult).not.toBeNull();
    expect(envelopeResult?.properties).toHaveProperty("success");
    expect(envelopeResult?.properties).toHaveProperty("data");
    expect(converter.factoryCache.size).toBeGreaterThan(0);
  });

  it("converts drizzle-zod schemas used by the example app", { timeout: 60_000 }, () => {
    const converter = new ZodSchemaConverter("apps/next-app-drizzle-zod/src/schemas");

    const createSchema = converter.convertZodSchemaToOpenApi("CreatePostSchema");
    const updateSchema = converter.convertZodSchemaToOpenApi("UpdatePostSchema");
    const responseSchema = converter.convertZodSchemaToOpenApi("PostResponseSchema");

    expect(createSchema).toMatchObject({
      type: "object",
      properties: {
        title: {
          type: "string",
          minLength: 5,
          maxLength: 255,
          description: "Post title",
        },
        slug: {
          type: "string",
          minLength: 3,
          maxLength: 255,
          pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$",
          description: "URL-friendly slug",
        },
        excerpt: {
          type: "string",
          maxLength: 500,
          description: "Short excerpt of the post",
        },
        content: {
          type: "string",
          minLength: 10,
          description: "Post content in markdown",
        },
        published: {
          type: "boolean",
          description: "Whether the post is published",
        },
        authorId: {
          type: "integer",
          minimum: 0,
          exclusiveMinimum: true,
          description: "ID of the post author",
        },
      },
      required: ["title", "slug", "content", "authorId"],
    });

    expect(updateSchema).toMatchObject({
      type: "object",
      properties: {
        title: {
          type: "string",
          minLength: 5,
          maxLength: 255,
          description: "Post title",
        },
        slug: {
          type: "string",
          pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$",
          description: "URL-friendly slug",
        },
        excerpt: {
          type: "string",
          maxLength: 500,
          description: "Short excerpt",
        },
        content: {
          type: "string",
          minLength: 10,
          description: "Post content",
        },
        published: {
          type: "boolean",
          description: "Publication status",
        },
      },
    });
    expect(updateSchema?.required).toEqual([]);
    expect(updateSchema?.properties).not.toHaveProperty("id");
    expect(updateSchema?.properties).not.toHaveProperty("authorId");

    expect(responseSchema).toMatchObject({
      type: "object",
      properties: {
        id: {
          type: "integer",
        },
        title: {
          type: "string",
          description: "Post title",
        },
        slug: {
          type: "string",
          description: "URL-friendly slug",
        },
        excerpt: {
          type: "string",
          nullable: true,
          description: "Post excerpt",
        },
        content: {
          type: "string",
          description: "Full post content",
        },
        published: {
          type: "boolean",
          description: "Publication status",
        },
        viewCount: {
          type: "integer",
          description: "Number of views",
        },
        authorId: {
          type: "integer",
        },
        createdAt: {
          type: "string",
          format: "date-time",
          description: "Creation timestamp",
        },
        updatedAt: {
          type: "string",
          format: "date-time",
          description: "Last update timestamp",
        },
      },
    });
    expect(responseSchema?.required).toEqual([
      "id",
      "title",
      "slug",
      "excerpt",
      "content",
      "published",
      "viewCount",
      "authorId",
      "createdAt",
      "updatedAt",
    ]);
  });
});
