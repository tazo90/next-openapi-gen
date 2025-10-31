import { z } from "zod";

// Zod schema for User
export const UserSchema = z.object({
  id: z.string().uuid().describe("User unique identifier"),
  email: z.string().email().describe("User email address"),
  name: z.string().min(2).max(100).describe("User full name"),
  roleId: z.string().uuid().describe("Reference to Role schema (from YAML)"),
  isActive: z.boolean().default(true).describe("User account status"),
  createdAt: z.date().describe("Account creation date"),
});

export const CreateUserSchema = UserSchema.omit({
  id: true,
  createdAt: true,
});

export const UpdateUserSchema = UserSchema.partial().omit({
  id: true,
  createdAt: true,
});

// Zod schema for Product
export const ProductSchema = z.object({
  id: z.string().uuid().describe("Product ID"),
  name: z.string().min(1).max(200).describe("Product name"),
  description: z.string().optional().describe("Product description"),
  price: z.number().positive().describe("Product price in USD"),
  inStock: z.boolean().describe("Availability status"),
  tags: z.array(z.string()).optional().describe("Product tags"),
});

export const CreateProductSchema = ProductSchema.omit({ id: true });
