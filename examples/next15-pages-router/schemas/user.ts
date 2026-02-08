import { z } from "zod";

export const UserSchema = z.object({
  id: z.string().describe("User ID"),
  name: z.string().describe("Full name"),
  email: z.string().email().describe("Email address"),
  createdAt: z.string().describe("Creation date"),
});

export const CreateUserSchema = z.object({
  name: z.string().min(2).describe("Full name"),
  email: z.string().email().describe("Email address"),
  password: z.string().min(8).describe("Password (min 8 characters)"),
});

export const UpdateUserSchema = z.object({
  name: z.string().min(2).optional().describe("Full name"),
  email: z.string().email().optional().describe("Email address"),
});

export const UserListParamsSchema = z.object({
  page: z.number().optional().describe("Page number"),
  limit: z.number().optional().describe("Results per page"),
  search: z.string().optional().describe("Search query"),
});

export const UserIdParamsSchema = z.object({
  id: z.string().describe("User ID"),
});

export type User = z.infer<typeof UserSchema>;
export type CreateUser = z.infer<typeof CreateUserSchema>;
export type UpdateUser = z.infer<typeof UpdateUserSchema>;
