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

export const WebhookEndpointSchema = z.object({
  id: z.string().uuid().describe("Webhook endpoint identifier"),
  deliveryUrl: z.string().url().describe("Webhook delivery URL"),
  eventTypes: z
    .array(z.enum(["invoice.paid", "project.archived", "user.invited"]))
    .min(1)
    .describe("Subscribed event types"),
  secretPreview: z.string().describe("Redacted signing secret"),
  status: z.enum(["pending", "verified"]).describe("Verification status"),
});

export const CreateWebhookEndpointSchema = WebhookEndpointSchema.omit({
  id: true,
  secretPreview: true,
  status: true,
});

export const WebhookEventSchema = z.object({
  id: z.string().describe("Webhook event identifier"),
  type: z.enum(["invoice.paid", "project.archived", "user.invited"]).describe("Webhook event type"),
  occurredAt: z.string().datetime().describe("When the event occurred"),
});

export const webhookRegistrationExamples = [
  {
    name: "billing-webhooks",
    value: {
      deliveryUrl: "https://example.com/hooks/billing",
      eventTypes: ["invoice.paid", "project.archived"],
    },
  },
];
