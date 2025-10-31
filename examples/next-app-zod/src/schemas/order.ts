import { z } from "zod";
import { AddressSchema } from "./user";
import { PaymentMethodSchema } from "./payment";
import { PaginatedResponse } from "./base";
import { CartItemSchema } from "./cart";

export const OrderIdParams = z.object({
  id: z.string().uuid().describe("Order ID"),
});

// Order status
export const OrderStatusSchema = z
  .enum([
    "pending",
    "payment_processing",
    "paid",
    "preparing",
    "shipped",
    "delivered",
    "cancelled",
    "refunded",
  ])
  .describe("Order status");

// Update order status request body
export const UpdateOrderStatusBody = z.object({
  status: OrderStatusSchema.describe("New order status"),
  notes: z
    .string()
    .optional()
    .describe("Additional notes about the status change"),
});

// Order
export const OrderSchema = z.object({
  id: z.string().uuid().describe("Order ID"),
  userId: z.string().uuid().describe("User ID"),
  items: z.array(CartItemSchema).describe("Purchased products"),
  shippingAddress: AddressSchema.describe("Shipping address"),
  billingAddress: AddressSchema.describe(
    "Billing address (can be the same as shipping address)"
  ),
  paymentMethod: PaymentMethodSchema.describe("Payment method"),
  status: OrderStatusSchema.describe("Order status"),
  subtotal: z
    .number()
    .nonnegative()
    .describe("Subtotal (without discount and shipping)"),
  discountAmount: z
    .number()
    .nonnegative()
    .default(0)
    .describe("Discount amount"),
  shippingCost: z.number().nonnegative().describe("Shipping cost"),
  tax: z.number().nonnegative().describe("Tax"),
  total: z.number().nonnegative().describe("Total amount"),
  notes: z.string().optional().describe("Additional notes"),
  createdAt: z.date().describe("Order creation date"),
  updatedAt: z.date().describe("Last update date"),
  paymentDate: z.date().nullable().describe("Payment date"),
  shippingDate: z.date().nullable().describe("Shipping date"),
  deliveryDate: z.date().nullable().describe("Delivery date"),
});

// --- Query and response schemas ---

// Query parameters for order list
export const OrdersQueryParams = z.object({
  page: z
    .number()
    .int()
    .positive()
    .optional()
    .default(1)
    .describe("Page number"),
  limit: z
    .number()
    .int()
    .positive()
    .max(100)
    .optional()
    .default(20)
    .describe("Results per page"),
  status: OrderStatusSchema.optional().describe("Filter by status"),
  dateFrom: z.date().optional().describe("Filter orders from date"),
  dateTo: z.date().optional().describe("Filter orders to date"),
  sort: z
    .enum(["date_asc", "date_desc", "total_asc", "total_desc"])
    .optional()
    .default("date_desc")
    .describe("Sort results"),
});

// Order list response
export const OrdersResponse = z.object({
  orders: z.array(OrderSchema).describe("List of orders"),
  pagination: z
    .object({
      total: z.number().int().nonnegative().describe("Total number of orders"),
      pages: z.number().int().positive().describe("Total number of pages"),
      page: z.number().int().positive().describe("Current page"),
      limit: z.number().int().positive().describe("Results per page"),
    })
    .describe("Pagination information"),
});

// Request body for creating an order
export const CreateOrderBody = z
  .object({
    cartId: z.string().uuid().describe("Cart ID"),
    shippingAddressId: z
      .number()
      .int()
      .optional()
      .describe("ID of shipping address from user profile"),
    billingAddressId: z
      .number()
      .int()
      .optional()
      .describe("ID of billing address from user profile"),
    shippingAddress: AddressSchema.optional().describe("New shipping address"),
    billingAddress: AddressSchema.optional().describe("New billing address"),
    useShippingAsBilling: z
      .boolean()
      .optional()
      .default(true)
      .describe("Use shipping address as billing address"),
    paymentMethodId: z
      .number()
      .int()
      .optional()
      .describe("ID of saved payment method"),
    paymentMethod:
      PaymentMethodSchema.optional().describe("New payment method"),
    notes: z.string().optional().describe("Additional order notes"),
  })
  .refine(
    (data) =>
      data.shippingAddressId !== undefined ||
      data.shippingAddress !== undefined,
    {
      message: "You must provide a shipping address or its ID",
      path: ["shippingAddress"],
    }
  )
  .refine(
    (data) => {
      if (data.useShippingAsBilling === true) return true;
      return (
        data.billingAddressId !== undefined || data.billingAddress !== undefined
      );
    },
    {
      message:
        "You must provide a billing address or its ID if it differs from the shipping address",
      path: ["billingAddress"],
    }
  )
  .refine(
    (data) =>
      data.paymentMethodId !== undefined || data.paymentMethod !== undefined,
    {
      message: "You must provide a payment method or its ID",
      path: ["paymentMethod"],
    }
  );

export type OrderStatus = z.infer<typeof OrderStatusSchema>;
export type Order = z.infer<typeof OrderSchema>;
export type OrdersQuery = z.infer<typeof OrdersQueryParams>;
export type CreateOrder = z.infer<typeof CreateOrderBody>;

// Example of creating a concrete type from a generic
export type PaginatedOrders = PaginatedResponse<Order>;
