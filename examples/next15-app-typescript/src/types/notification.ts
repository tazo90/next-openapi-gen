// Union Type Examples for TypeScript
// This file demonstrates how to use union types with next-openapi-gen

// ========================================
// 1. Discriminated Union for API Responses
// ========================================

export interface SuccessResponse {
  status: "success";
  data: {
    id: string; // Unique identifier
    message: string; // Success message
  };
}

export interface ErrorResponse {
  status: "error";
  error: string; // Error message
  code: number; // Error code
}

/**
 * API response that can be either success or error
 * This demonstrates a discriminated union pattern with a 'status' discriminator
 */
export type ApiResponse = SuccessResponse | ErrorResponse;

// ========================================
// 2. Literal Union for Notification Types
// ========================================

/**
 * Available notification channels
 * This demonstrates a literal union (converted to enum in OpenAPI)
 */
export type NotificationType = "email" | "sms" | "push";

// ========================================
// 3. Nullable Type
// ========================================

/**
 * Optional message that can be null
 * This demonstrates nullable type handling
 */
export type OptionalMessage = string | null;

// ========================================
// 4. Discriminated Union for Notification Channels
// ========================================

export interface EmailNotification {
  type: "email";
  to: string; // Recipient email address
  subject: string; // Email subject
  body: string; // Email body content
}

export interface SmsNotification {
  type: "sms";
  phoneNumber: string; // Phone number with country code (e.g., +1234567890)
  message: string; // SMS message (max 160 characters)
}

export interface PushNotification {
  type: "push";
  deviceId: string; // Device identifier for push notification
  title: string; // Notification title
  body: string; // Notification body
}

/**
 * Union of all notification types
 * This demonstrates a discriminated union with a 'type' field as the discriminator
 * Each variant has different properties based on the notification channel
 */
export type Notification =
  | EmailNotification
  | SmsNotification
  | PushNotification;

// ========================================
// 5. Status Enum Pattern
// ========================================

/**
 * Processing status for async operations
 * Literal unions like this are converted to enums in OpenAPI
 */
export type ProcessingStatus = "pending" | "processing" | "completed" | "failed";

// ========================================
// 6. Permission Levels
// ========================================

/**
 * User permission levels
 */
export type Permission = "read" | "write" | "admin";
