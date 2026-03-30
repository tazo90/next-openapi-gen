import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

import { authors } from "@/db/schema";

export const CreateAuthorSchema = createInsertSchema(authors, {
  bio: (schema) => schema.max(280).optional().describe("Author biography"),
  email: (schema) => schema.email().describe("Author email address"),
  name: (schema) => schema.min(2).max(100).describe("Author display name"),
}).omit({
  createdAt: true,
  id: true,
});

export const UpdateAuthorSchema = createInsertSchema(authors, {
  avatarUrl: (schema) => schema.url().optional().describe("Author avatar URL"),
  bio: (schema) => schema.max(280).optional().describe("Author biography"),
  name: (schema) => schema.min(2).max(100).optional().describe("Author display name"),
}).omit({
  createdAt: true,
  email: true,
  id: true,
});

export const AuthorResponseSchema = createSelectSchema(authors, {
  avatarUrl: (schema) => schema.describe("Author avatar URL"),
  bio: (schema) => schema.describe("Author biography"),
  createdAt: (schema) => schema.describe("Creation timestamp"),
  email: (schema) => schema.describe("Author email address"),
  name: (schema) => schema.describe("Author display name"),
});

export const AuthorIdParams = z.object({
  id: z.string().regex(/^\d+$/).describe("Author ID"),
});

export const AuthorsQueryParams = z.object({
  page: z.string().regex(/^\d+$/).optional().describe("Page number"),
  limit: z.string().regex(/^\d+$/).optional().describe("Items per page"),
  search: z.string().optional().describe("Case-insensitive author search"),
  sort: z.enum(["name", "recent"]).optional().describe("Sort mode"),
});

export const AuthorBatchStatusUpdateSchema = z.object({
  authorIds: z.array(z.number().int().positive()).min(1).describe("Author IDs to update"),
  status: z.enum(["featured", "standard"]).describe("Visibility bucket to assign"),
});
