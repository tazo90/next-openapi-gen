import { z } from "zod";

export const ProductSchema = z.object({
  id: z.string().describe("Product ID"),
  name: z.string().describe("Product name"),
  description: z.string().optional().describe("Product description"),
  price: z.number().positive().describe("Product price"),
  stock: z.number().int().min(0).describe("Stock quantity"),
  category: z.string().describe("Product category"),
});

export const CreateProductSchema = z.object({
  name: z.string().min(1).describe("Product name"),
  description: z.string().optional().describe("Product description"),
  price: z.number().positive().describe("Product price"),
  stock: z.number().int().min(0).default(0).describe("Stock quantity"),
  category: z.string().describe("Product category"),
});

export const ProductIdParamsSchema = z.object({
  id: z.string().describe("Product ID"),
});

export const ProductListParamsSchema = z.object({
  category: z.string().optional().describe("Filter by category"),
  minPrice: z.number().optional().describe("Minimum price"),
  maxPrice: z.number().optional().describe("Maximum price"),
  page: z.number().optional().describe("Page number"),
  limit: z.number().optional().describe("Results per page"),
});

export type Product = z.infer<typeof ProductSchema>;
export type CreateProduct = z.infer<typeof CreateProductSchema>;
