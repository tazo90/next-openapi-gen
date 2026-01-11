/**
 * Product API Types
 *
 * This file demonstrates TypeScript utility types support in next-openapi-gen:
 * - Awaited<T>: Unwraps Promise types
 * - ReturnType<typeof func>: Extracts return type from functions
 * - Parameters<typeof func>: Extracts parameter types
 * - Nested utility types: Awaited<ReturnType<typeof func>>
 */

import {
  getProductById,
  getProductSummary,
  createProduct,
  updateStock,
} from "../app/api/products/route.utils";

// ============================================================================
// Path Parameters
// ============================================================================

/**
 * Path parameter for product ID
 */
export interface ProductIdParam {
  id: string;
}

// ============================================================================
// Example 1: Awaited<ReturnType<typeof func>> - The main bug fix!
// ============================================================================

/**
 * This is the pattern from issue #53 that was previously broken.
 * Now it correctly resolves to the actual return type structure.
 *
 * Before: { } (empty object)
 * After: { product: Product, fetchedAt: string }
 */
export type ProductByIdResponse = Awaited<ReturnType<typeof getProductById>>;

/**
 * Another example: Extract return type from async function
 */
export type ProductSummaryResponse = Awaited<
  ReturnType<typeof getProductSummary>
>;

// ============================================================================
// Example 2: ReturnType<typeof func> - Sync functions
// ============================================================================

/**
 * Extract return type from synchronous function
 * Works perfectly with functions that have explicit return type annotations
 */
export type CreateProductResponse = ReturnType<typeof createProduct>;

// ============================================================================
// Example 3: Parameters<typeof func> - Extract parameter types
// ============================================================================

/**
 * Extract all parameters as a tuple
 * Returns: [productData: {...}, options: {...}]
 */
export type CreateProductParams = Parameters<typeof createProduct>;

/**
 * Extract first parameter only using indexed access
 * Returns: { name: string; price: number }
 */
export type CreateProductData = Parameters<typeof createProduct>[0];

/**
 * Extract second parameter only
 * Returns: { notify: boolean }
 */
export type CreateProductOptions = Parameters<typeof createProduct>[1];

// ============================================================================
// Example 4: Update stock - Awaited<ReturnType<typeof func>>
// ============================================================================

/**
 * Extract return type from async updateStock function
 * Now with proper return type annotation!
 */
export type UpdateStockResponse = Awaited<ReturnType<typeof updateStock>>;

/**
 * Request body for updating stock
 */
export interface UpdateStockRequest {
  inStock: boolean;
}

// ============================================================================
// Example 5: Complex nested types
// ============================================================================

/**
 * You can create complex type transformations
 */
export type ProductResponseData = Awaited<
  ReturnType<typeof getProductById>
>["product"];

// ============================================================================
// Example 6: Request/Response types for API routes
// ============================================================================

/**
 * Complete request body type for creating a product
 */
export interface CreateProductRequest {
  product: CreateProductData;
  options?: CreateProductOptions;
}

/**
 * Standardized API response wrapper
 */
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  timestamp: string;
}

/**
 * Typed API responses using utility types
 */
export type GetProductApiResponse = ApiResponse<ProductByIdResponse>;
export type CreateProductApiResponse = ApiResponse<CreateProductResponse>;
export type UpdateStockApiResponse = ApiResponse<UpdateStockResponse>;
