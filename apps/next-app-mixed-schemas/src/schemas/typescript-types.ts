// TypeScript type definitions

/**
 * Order status enum
 */
export type OrderStatus = "pending" | "processing" | "shipped" | "delivered" | "cancelled";

/**
 * Order item
 */
export type OrderItem = {
  /** Product ID reference */
  productId: string;
  /** Item quantity */
  quantity: number;
  /** Price per unit at time of order */
  pricePerUnit: number;
};

/**
 * Complete order details
 */
export type Order = {
  /** Order unique identifier */
  id: string;
  /** User ID who placed the order */
  userId: string;
  /** List of ordered items */
  items: OrderItem[];
  /** Current order status */
  status: OrderStatus;
  /** Order total amount */
  totalAmount: number;
  /** Order creation timestamp */
  createdAt: Date;
  /** Last update timestamp */
  updatedAt: Date;
};

/**
 * Create order request
 */
export type CreateOrderRequest = {
  /** List of items to order */
  items: OrderItem[];
};

/**
 * Pagination parameters
 */
export type PaginationParams = {
  /** Page number (1-indexed) */
  page?: number;
  /** Items per page */
  limit?: number;
};

/**
 * Paginated response wrapper
 */
export type PaginatedResponse<T> = {
  /** Array of items */
  data: T[];
  /** Total number of items */
  total: number;
  /** Current page */
  page: number;
  /** Items per page */
  limit: number;
  /** Total number of pages */
  totalPages: number;
};

export type WebhookAttempt = {
  deliveredAt: Date;
  eventId: string;
  id: string;
  status: "delivered" | "failed";
};

export type WebhookAttemptList = PaginatedResponse<WebhookAttempt>;

export type WebhookDeliveryLinkParams = {
  eventId: string;
};
