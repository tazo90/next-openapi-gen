import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { posts } from "@/db/schema";
import { z } from "zod";

/**
 * Schema for creating a new post
 * Generated from Drizzle table definition with additional validation
 */
export const CreatePostSchema = createInsertSchema(posts, {
  title: (schema) =>
    schema.title
      .min(5, "Title must be at least 5 characters")
      .max(255, "Title must not exceed 255 characters")
      .describe("Post title"),

  slug: (schema) =>
    schema.slug
      .min(3)
      .max(255)
      .regex(
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
        "Slug must be lowercase with hyphens"
      )
      .describe("URL-friendly slug"),

  excerpt: (schema) =>
    schema.excerpt
      .max(500, "Excerpt must not exceed 500 characters")
      .optional()
      .describe("Short excerpt of the post"),

  content: (schema) =>
    schema.content
      .min(10, "Content must be at least 10 characters")
      .describe("Post content in markdown"),

  published: (schema) =>
    schema.published.optional().describe("Whether the post is published"),

  authorId: (schema) =>
    schema.authorId
      .positive("Author ID must be positive")
      .describe("ID of the post author"),
});

/**
 * Schema for updating an existing post
 * All fields are optional except id
 */
export const UpdatePostSchema = createInsertSchema(posts, {
  title: (schema) =>
    schema.title.min(5).max(255).optional().describe("Post title"),

  slug: (schema) =>
    schema.slug
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .optional()
      .describe("URL-friendly slug"),

  excerpt: (schema) =>
    schema.excerpt.max(500).optional().describe("Short excerpt"),

  content: (schema) =>
    schema.content.min(10).optional().describe("Post content"),

  published: (schema) =>
    schema.published.optional().describe("Publication status"),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  viewCount: true,
  authorId: true,
});

/**
 * Schema for post response
 * Represents a complete post object returned by the API
 */
export const PostResponseSchema = createSelectSchema(posts, {
  title: (schema) => schema.title.describe("Post title"),
  slug: (schema) => schema.slug.describe("URL-friendly slug"),
  excerpt: (schema) => schema.excerpt.describe("Post excerpt"),
  content: (schema) => schema.content.describe("Full post content"),
  published: (schema) => schema.published.describe("Publication status"),
  viewCount: (schema) => schema.viewCount.describe("Number of views"),
  createdAt: (schema) => schema.createdAt.describe("Creation timestamp"),
  updatedAt: (schema) => schema.updatedAt.describe("Last update timestamp"),
});

/**
 * Path parameters for post endpoints
 */
export const PostIdParams = z.object({
  id: z.string().regex(/^\d+$/).describe("Post ID"),
});

/**
 * Query parameters for listing posts
 */
export const PostsQueryParams = z.object({
  page: z.string().regex(/^\d+$/).optional().describe("Page number"),
  limit: z.string().regex(/^\d+$/).optional().describe("Items per page"),
  published: z
    .enum(["true", "false"])
    .optional()
    .describe("Filter by publication status"),
  authorId: z
    .string()
    .regex(/^\d+$/)
    .optional()
    .describe("Filter by author ID"),
});
