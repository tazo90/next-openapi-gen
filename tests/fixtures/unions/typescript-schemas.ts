// TypeScript Union Test Fixtures
// These fixtures are used to test union type support in the schema processor

// ========================================
// 1. Literal Unions (should become enums)
// ========================================

export type Status = "active" | "inactive" | "pending";

export type UserRole = "admin" | "member" | "guest";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

// Numeric literal union
export type Priority = 1 | 2 | 3 | 4 | 5;

// Boolean literal union
export type TriState = true | false | null;

// ========================================
// 2. Type Reference Unions (should use oneOf)
// ========================================

export interface SuccessResponse {
  success: true;
  data: string;
}

export interface ErrorResponse {
  success: false;
  error: string;
  code: number;
}

export type ApiResponse = SuccessResponse | ErrorResponse;

// ========================================
// 3. Nullable Types (should add nullable: true)
// ========================================

export type OptionalString = string | null;

export type OptionalNumber = number | null;

export type OptionalObject = { id: string; name: string } | null;

// With undefined
export type MaybeString = string | undefined;

// With both null and undefined
export type NullableOrUndefined = string | null | undefined;

// ========================================
// 4. Discriminated Unions (recommended pattern)
// ========================================

export interface EmailNotification {
  type: "email";
  to: string; // Email address
  subject: string; // Email subject
  body: string; // Email body content
}

export interface SmsNotification {
  type: "sms";
  phoneNumber: string; // Phone number with country code
  message: string; // SMS message (max 160 chars)
}

export interface PushNotification {
  type: "push";
  deviceId: string; // Device identifier
  title: string; // Notification title
  body: string; // Notification body
}

export type Notification =
  | EmailNotification
  | SmsNotification
  | PushNotification;

// ========================================
// 5. Mixed Unions (literal + reference types)
// ========================================

export interface UserData {
  id: string;
  name: string;
  email: string;
}

export type LoadingState = "loading" | "error" | UserData;

// ========================================
// 6. Nested Unions
// ========================================

export type PrimitiveType = string | number | boolean;

export type ComplexType = PrimitiveType | null | undefined;

// ========================================
// 7. Unions in Object Properties
// ========================================

export interface ApiResult {
  status: "success" | "error" | "pending";
  data: string | number | null;
  message?: string | null;
}

// ========================================
// 8. Array of Union Types
// ========================================

export type MixedArray = Array<string | number | boolean>;

// ========================================
// 9. Conditional Response Types
// ========================================

export interface GetUserSuccessResponse {
  status: "success";
  user: {
    id: string;
    name: string;
    email: string;
  };
}

export interface GetUserErrorResponse {
  status: "error";
  message: string;
}

export type GetUserResponse = GetUserSuccessResponse | GetUserErrorResponse;

// ========================================
// 10. Payment Method Example (Real-world use case)
// ========================================

export interface CreditCardPayment {
  type: "credit_card";
  cardNumber: string; // Credit card number
  expiryDate: string; // MM/YY format
  cvv: string; // CVV code
}

export interface PayPalPayment {
  type: "paypal";
  email: string; // PayPal account email
}

export interface BankTransferPayment {
  type: "bank_transfer";
  accountNumber: string; // Bank account number
  routingNumber: string; // Bank routing number
}

export type PaymentMethod =
  | CreditCardPayment
  | PayPalPayment
  | BankTransferPayment;
