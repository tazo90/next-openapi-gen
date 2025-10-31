import { z } from "zod";

export const CartItemSchema = z.object({
  id: z.string().uuid().describe("Cart item ID"),
  productId: z.string().uuid().describe("Product ID"),
  name: z.string().describe("Product name"),
  description: z.string().optional().describe("Product description"),
  price: z.number().nonnegative().describe("Unit price"),
  quantity: z.number().int().positive().describe("Quantity"),
  total: z.number().nonnegative().describe("Total price (price * quantity)"),
  imageUrl: z.string().url().optional().describe("Product image URL"),
  variant: z
    .string()
    .optional()
    .describe("Product variant (e.g., size, color)"),
});
