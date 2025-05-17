import { z } from "zod";
import { PaymentMethodSchema } from "./payment";
import { PaginatedResponse } from "./base";

// Path parameters schema
export const UserIdParams = z.object({
  id: z.string().uuid().describe("User ID"),
});

// Query parameters for optional fields selection
export const UserFieldsQuery = z.object({
  fields: z
    .string()
    .optional()
    .describe("Comma-separated list of fields to include"),
});

export const UserBaseSchema = z.object({
  id: z.string().uuid().describe("Unique user identifier"),
  email: z.string().email().describe("User's email address"),
  name: z.string().min(2).max(100).describe("User's full name"),
  role: z
    .enum(["user", "admin", "moderator"])
    .describe("User's role in the system"),
});

export const AddressSchema = z.object({
  street: z.string().describe("Street name"),
  houseNumber: z.string().describe("House/apartment number"),
  city: z.string().describe("City"),
  postalCode: z
    .string()
    .regex(/^\d{2}-\d{3}$/)
    .describe("Postal code (format: XX-XXX)"),
  country: z.string().default("Poland").describe("Country"),
});

export const UserDetailedSchema = UserBaseSchema.extend({
  phone: z
    .string()
    .regex(/^\+48 \d{3} \d{3} \d{3}$/)
    .optional()
    .describe("Phone number (format: +48 XXX XXX XXX)"),
  birthDate: z.date().optional().describe("Date of birth"),
  addresses: z
    .array(AddressSchema)
    .optional()
    .describe("List of user addresses"),
  primaryAddress: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe("Index of primary address"),
  preferences: z
    .object({
      language: z
        .enum(["pl", "en", "de"])
        .default("en")
        .describe("Preferred language"),
      theme: z
        .enum(["light", "dark", "system"])
        .default("system")
        .describe("Preferred theme"),
      notifications: z
        .boolean()
        .default(true)
        .describe("Whether notifications are enabled"),
    })
    .optional()
    .describe("User preferences"),
  paymentMethods: z
    .array(PaymentMethodSchema)
    .optional()
    .describe("Saved payment methods"),
  createdAt: z.date().describe("Account creation date"),
  updatedAt: z.date().describe("Last update date"),
});

// Update user request body
export const UpdateUserBody = z
  .object({
    name: z.string().min(2).max(100).optional().describe("User's full name"),
    email: z.string().email().optional().describe("User's email address"),
    phone: z
      .string()
      .regex(/^\+\d{1,3} \d{3} \d{3} \d{3}$/)
      .optional()
      .describe("Phone number (format: +XX XXX XXX XXX)"),
    preferences: z
      .object({
        language: z
          .enum(["pl", "en", "de"])
          .optional()
          .describe("Preferred language"),
        theme: z
          .enum(["light", "dark", "system"])
          .optional()
          .describe("Preferred theme"),
        notifications: z
          .boolean()
          .optional()
          .describe("Whether notifications are enabled"),
      })
      .optional()
      .describe("User preferences"),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided for update",
  });

// Export TypeScript types using z.infer
export type User = z.infer<typeof UserBaseSchema>;
export type UserDetailed = z.infer<typeof UserDetailedSchema>;
export type Address = z.infer<typeof AddressSchema>;
export type PaginatedUsers = PaginatedResponse<UserDetailed>;
