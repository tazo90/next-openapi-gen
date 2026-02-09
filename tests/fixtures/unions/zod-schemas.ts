// Zod Union Test Fixtures
// These fixtures are used to test Zod union type support in the zod converter

import { z } from "zod";

// ========================================
// 1. Simple Unions (should use oneOf)
// ========================================

export const StringOrNumberSchema = z.union([z.string(), z.number()]);

export const StringOrBooleanSchema = z.union([z.string(), z.boolean()]);

export const PrimitiveUnionSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
]);

// ========================================
// 2. Literal Unions (should become enums)
// ========================================

export const StatusSchema = z.union([
  z.literal("active"),
  z.literal("inactive"),
  z.literal("pending"),
]);

export const UserRoleSchema = z.union([
  z.literal("admin"),
  z.literal("member"),
  z.literal("guest"),
]);

export const HttpMethodSchema = z.union([
  z.literal("GET"),
  z.literal("POST"),
  z.literal("PUT"),
  z.literal("PATCH"),
  z.literal("DELETE"),
]);

// Numeric literal union
export const PrioritySchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
]);

// ========================================
// 3. Nullable Unions (should add nullable: true)
// ========================================

export const NullableStringSchema = z.union([z.string(), z.null()]);

export const NullableNumberSchema = z.union([z.number(), z.null()]);

export const NullableObjectSchema = z.union([
  z.object({
    id: z.string(),
    name: z.string(),
  }),
  z.null(),
]);

// ========================================
// 4. Schema Reference Unions (should use oneOf with $ref)
// ========================================

const SuccessResponseSchema = z.object({
  success: z.literal(true),
  data: z.string().describe("Response data"),
});

const ErrorResponseSchema = z.object({
  success: z.literal(false),
  error: z.string().describe("Error message"),
  code: z.number().describe("Error code"),
});

export const ApiResponseSchema = z.union([
  SuccessResponseSchema,
  ErrorResponseSchema,
]);

// ========================================
// 5. Discriminated Unions (recommended pattern)
// ========================================

const EmailNotificationSchema = z.object({
  type: z.literal("email"),
  to: z.string().email().describe("Recipient email address"),
  subject: z.string().min(1).describe("Email subject"),
  body: z.string().describe("Email body content"),
});

const SmsNotificationSchema = z.object({
  type: z.literal("sms"),
  phoneNumber: z.string().describe("Phone number with country code"),
  message: z.string().max(160).describe("SMS message (max 160 chars)"),
});

const PushNotificationSchema = z.object({
  type: z.literal("push"),
  deviceId: z.string().describe("Device identifier"),
  title: z.string().describe("Notification title"),
  body: z.string().describe("Notification body"),
});

// Discriminated union using z.discriminatedUnion
export const NotificationSchema = z.discriminatedUnion("type", [
  EmailNotificationSchema,
  SmsNotificationSchema,
  PushNotificationSchema,
]);

// Regular union for comparison
export const NotificationRegularUnionSchema = z.union([
  EmailNotificationSchema,
  SmsNotificationSchema,
  PushNotificationSchema,
]);

// ========================================
// 6. Payment Method Example (Real-world use case)
// ========================================

const CreditCardPaymentSchema = z.object({
  type: z.literal("credit_card"),
  cardNumber: z.string().describe("Credit card number"),
  expiryDate: z.string().regex(/^\d{2}\/\d{2}$/).describe("MM/YY format"),
  cvv: z.string().length(3).describe("CVV code"),
});

const PayPalPaymentSchema = z.object({
  type: z.literal("paypal"),
  email: z.string().email().describe("PayPal account email"),
});

const BankTransferPaymentSchema = z.object({
  type: z.literal("bank_transfer"),
  accountNumber: z.string().describe("Bank account number"),
  routingNumber: z.string().describe("Bank routing number"),
});

export const PaymentMethodSchema = z.discriminatedUnion("type", [
  CreditCardPaymentSchema,
  PayPalPaymentSchema,
  BankTransferPaymentSchema,
]);

// ========================================
// 7. Nested Unions
// ========================================

export const NestedUnionSchema = z.union([
  z.union([z.string(), z.number()]),
  z.union([z.boolean(), z.null()]),
]);

// ========================================
// 8. Union with Complex Objects
// ========================================

const GetUserSuccessSchema = z.object({
  status: z.literal("success"),
  user: z.object({
    id: z.string().describe("User ID"),
    name: z.string().describe("User name"),
    email: z.string().email().describe("User email"),
  }),
});

const GetUserErrorSchema = z.object({
  status: z.literal("error"),
  message: z.string().describe("Error message"),
});

export const GetUserResponseSchema = z.discriminatedUnion("status", [
  GetUserSuccessSchema,
  GetUserErrorSchema,
]);

// ========================================
// 9. Optional/Nullable Pattern
// ========================================

export const OptionalStringSchema = z.union([z.string(), z.undefined()]);

export const NullableOrUndefinedSchema = z.union([
  z.string(),
  z.null(),
  z.undefined(),
]);

// ========================================
// 10. Array of Union Types
// ========================================

export const MixedArraySchema = z.array(
  z.union([z.string(), z.number(), z.boolean()])
);

// ========================================
// 11. Union in Object Properties
// ========================================

export const ApiResultSchema = z.object({
  status: z.union([
    z.literal("success"),
    z.literal("error"),
    z.literal("pending"),
  ]),
  data: z.union([z.string(), z.number(), z.null()]),
  message: z.union([z.string(), z.null()]).optional(),
});

// ========================================
// 12. Alternative enum-style pattern
// ========================================

// Using z.enum as comparison
export const StatusEnumSchema = z.enum(["active", "inactive", "pending"]);

// Compare with literal union
export const StatusLiteralUnionSchema = z.union([
  z.literal("active"),
  z.literal("inactive"),
  z.literal("pending"),
]);
