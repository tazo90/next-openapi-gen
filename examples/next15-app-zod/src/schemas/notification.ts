// Zod Union Type Examples
// This file demonstrates how to use Zod union types with next-openapi-gen

import { z } from "zod";

// ========================================
// 1. Discriminated Union Schemas for Notifications
// ========================================

const EmailNotificationSchema = z.object({
  type: z.literal("email"),
  to: z.string().email().describe("Recipient email address"),
  subject: z.string().min(1).describe("Email subject"),
  body: z.string().describe("Email body content"),
});

const SmsNotificationSchema = z.object({
  type: z.literal("sms"),
  phoneNumber: z.string().describe("Phone number with country code (e.g., +1234567890)"),
  message: z.string().max(160).describe("SMS message (max 160 characters)"),
});

const PushNotificationSchema = z.object({
  type: z.literal("push"),
  deviceId: z.string().describe("Device identifier for push notification"),
  title: z.string().describe("Notification title"),
  body: z.string().describe("Notification body"),
});

/**
 * Discriminated union for notifications (RECOMMENDED)
 * Using z.discriminatedUnion provides better OpenAPI compatibility
 * and enables the discriminator field in the spec
 */
export const NotificationSchema = z.discriminatedUnion("type", [
  EmailNotificationSchema,
  SmsNotificationSchema,
  PushNotificationSchema,
]);

// ========================================
// 2. Simple Literal Union for Notification Types
// ========================================

/**
 * Simple literal union (converted to enum in OpenAPI)
 * This is equivalent to: type NotificationType = "email" | "sms" | "push"
 */
export const NotificationTypeSchema = z.union([
  z.literal("email"),
  z.literal("sms"),
  z.literal("push"),
]);

// Alternative: Using z.enum (produces the same result)
export const NotificationTypeEnumSchema = z.enum(["email", "sms", "push"]);

// ========================================
// 3. API Response Union (Success/Error Pattern)
// ========================================

const SuccessResponseSchema = z.object({
  status: z.literal("success"),
  data: z.object({
    id: z.string().describe("Unique identifier"),
    message: z.string().describe("Success message"),
  }),
});

const ErrorResponseSchema = z.object({
  status: z.literal("error"),
  error: z.string().describe("Error message"),
  code: z.number().describe("Error code"),
});

/**
 * API response that can be either success or error
 * Uses discriminated union with 'status' as the discriminator
 */
export const ApiResponseSchema = z.discriminatedUnion("status", [
  SuccessResponseSchema,
  ErrorResponseSchema,
]);

// ========================================
// 4. Nullable Union (Optional Values)
// ========================================

/**
 * Optional message that can be null
 * This demonstrates nullable type handling
 */
export const OptionalMessageSchema = z.union([z.string(), z.null()]);

// Alternative: Using .nullable()
export const OptionalMessageAlternativeSchema = z.string().nullable();

// ========================================
// 5. Processing Status Enum
// ========================================

/**
 * Processing status for async operations
 * Literal unions are converted to enums in OpenAPI
 */
export const ProcessingStatusSchema = z.union([
  z.literal("pending"),
  z.literal("processing"),
  z.literal("completed"),
  z.literal("failed"),
]);

// ========================================
// 6. Permission Levels
// ========================================

/**
 * User permission levels using z.enum
 */
export const PermissionSchema = z.enum(["read", "write", "admin"]);

// ========================================
// 7. Mixed Type Union
// ========================================

/**
 * Union of different primitive types
 * This demonstrates oneOf in OpenAPI
 */
export const StringOrNumberSchema = z.union([z.string(), z.number()]);

// ========================================
// 8. Array of Union Types
// ========================================

/**
 * Array containing mixed types
 */
export const MixedArraySchema = z.array(
  z.union([z.string(), z.number(), z.boolean()])
);

// ========================================
// 9. Complex Nested Union Example
// ========================================

const UserDataSchema = z.object({
  id: z.string().describe("User ID"),
  name: z.string().describe("User name"),
  email: z.string().email().describe("User email"),
});

/**
 * Loading state that can be a string literal or user data
 * This demonstrates a union of literals and complex types
 */
export const LoadingStateSchema = z.union([
  z.literal("loading"),
  z.literal("error"),
  UserDataSchema,
]);

// ========================================
// 10. Payment Method Example (Real-world Use Case)
// ========================================

const CreditCardPaymentSchema = z.object({
  type: z.literal("credit_card"),
  cardNumber: z.string().describe("Credit card number"),
  expiryDate: z
    .string()
    .regex(/^\d{2}\/\d{2}$/)
    .describe("Expiry date in MM/YY format"),
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

/**
 * Payment method discriminated union
 * Demonstrates how to model payment methods with different required fields
 */
export const PaymentMethodSchema = z.discriminatedUnion("type", [
  CreditCardPaymentSchema,
  PayPalPaymentSchema,
  BankTransferPaymentSchema,
]);
