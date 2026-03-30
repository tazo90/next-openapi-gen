import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

import { posts } from "../db/schema";

export const CreatePostSchema = createInsertSchema(posts, {
  title: (schema) => schema.min(5).max(255).describe("Post title"),
  slug: (schema) =>
    schema
      .min(3)
      .max(255)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase with hyphens")
      .describe("URL-friendly slug"),
  excerpt: (schema) => schema.max(500).optional().describe("Short excerpt of the post"),
  content: (schema) => schema.min(10).describe("Post content in markdown"),
  published: (schema) => schema.optional().describe("Whether the post is published"),
  authorId: (schema) => schema.positive("Author ID must be positive").describe("Author ID"),
});

export const UpdatePostSchema = createInsertSchema(posts, {
  title: (schema) => schema.min(5).max(255).optional().describe("Post title"),
  slug: (schema) =>
    schema
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .optional()
      .describe("URL-friendly slug"),
  excerpt: (schema) => schema.max(500).optional().describe("Short excerpt"),
  content: (schema) => schema.min(10).optional().describe("Post content"),
  published: (schema) => schema.optional().describe("Publication status"),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  viewCount: true,
  authorId: true,
});

export const PostResponseSchema = createSelectSchema(posts, {
  title: (schema) => schema.describe("Post title"),
  slug: (schema) => schema.describe("URL-friendly slug"),
  excerpt: (schema) => schema.describe("Post excerpt"),
  content: (schema) => schema.describe("Full post content"),
  published: (schema) => schema.describe("Publication status"),
  viewCount: (schema) => schema.describe("Number of views"),
  createdAt: (schema) => schema.describe("Creation timestamp"),
  updatedAt: (schema) => schema.describe("Last update timestamp"),
});

export const PostIdParams = z.object({
  id: z.string().regex(/^\d+$/).describe("Post ID"),
});

export const PostsQueryParams = z.object({
  page: z.string().regex(/^\d+$/).optional().describe("Page number"),
  limit: z.string().regex(/^\d+$/).optional().describe("Items per page"),
  published: z.enum(["true", "false"]).optional().describe("Filter by publication status"),
  authorId: z.string().regex(/^\d+$/).optional().describe("Filter by author ID"),
});
