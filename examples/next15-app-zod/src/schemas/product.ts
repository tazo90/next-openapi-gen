import { z } from "zod";

// Define Zod schemas for path parameters
export const ProductIdParams = z.object({
  id: z.string().describe("Unique product identifier"),
});

// Define schema for query parameters
export const ProductQueryParams = z.object({
  include_variants: z
    .boolean()
    .optional()
    .describe("Whether to include product variants"),
  currency: z
    .enum(["USD", "EUR", "PLN"])
    .default("USD")
    .describe("Currency for prices"),
});

// Define schema for product category
export const ProductCategorySchema = z.object({
  id: z.string().uuid().describe("Category identifier"),
  name: z.string().min(1).describe("Category name"),
  slug: z.string().describe("Category slug used in URLs"),
});

// Define schema for product variant
export const ProductVariantSchema = z.object({
  id: z.string().uuid().describe("Variant identifier"),
  name: z.string().min(1).describe("Variant name"),
  sku: z.string().describe("Variant SKU code"),
  price: z.number().positive().describe("Variant price"),
  stock: z.number().int().nonnegative().describe("Stock quantity"),
  attributes: z
    .record(z.string(), z.string())
    .describe("Variant attributes (color, size, etc.)"),
});

// Define main product schema
export const ProductResponseSchema = z.object({
  id: z.string().uuid().describe("Unique product identifier"),
  name: z.string().min(3).describe("Product name"),
  description: z.string().optional().describe("Product description"),
  price: z.number().positive().describe("Base product price"),
  image_url: z.string().url().optional().describe("URL to main product image"),
  gallery: z.array(z.string().url()).describe("Product image gallery"),
  categories: z.array(ProductCategorySchema).describe("Product categories"),
  variants: z
    .array(ProductVariantSchema)
    .optional()
    .describe("Product variants"),
  created_at: z.date().describe("Product creation date"),
  updated_at: z.date().describe("Product last update date"),
  status: z.enum(["draft", "published", "archived"]).describe("Product status"),
  average_rating: z
    .number()
    .min(0)
    .max(5)
    .optional()
    .describe("Average product rating"),
});

// Define schema for product updates
export const UpdateProductSchema = z.object({
  name: z.string().min(3).optional().describe("Product name"),
  description: z.string().optional().describe("Product description"),
  price: z.number().positive().optional().describe("Base product price"),
  image_url: z.string().url().optional().describe("URL to main product image"),
  gallery: z
    .array(z.string().url())
    .optional()
    .describe("Product image gallery"),
  category_ids: z
    .array(z.string())
    .optional()
    .describe("Product category identifiers"),
  status: z
    .enum(["draft", "published", "archived"])
    .optional()
    .describe("Product status"),
});
