import { z } from "zod";

/**
 * Pagination metadata for cursor-based pagination responses
 */
export const PaginationMeta = z.object({
  /** Cursor for the next page (null if no more items) */
  nextCursor: z.string().nullable().describe("Cursor for the next page"),
  /** Whether there are more items after this page */
  hasMore: z.boolean().describe("Whether there are more items after this page"),
  /** Number of items in this page */
  limit: z.number().int().positive().describe("Number of items in this page"),
  /** Total count of items (optional) */
  total: z.number().int().nonnegative().optional().describe("Total count of items"),
});

export type PaginationMeta = z.infer<typeof PaginationMeta>;

/**
 * Creates a paginated response schema for any data type.
 *
 * This factory function demonstrates that ANY function name works -
 * the generator automatically detects functions that return Zod schemas.
 *
 * @param dataSchema - Zod schema for individual items
 * @returns Schema for paginated response with data array and pagination metadata
 *
 * @example
 * const GetTeamsResponse = createPaginatedSchema(TeamResponse);
 */
export function createPaginatedSchema<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.object({
    data: z.array(dataSchema).describe("Array of items"),
    pagination: PaginationMeta.describe("Pagination metadata"),
  });
}

/**
 * Alternative factory with different naming - demonstrates that naming doesn't matter
 */
export const makePaginatedResponse = <T extends z.ZodTypeAny>(itemSchema: T) => {
  return z.object({
    items: z.array(itemSchema).describe("Array of paginated items"),
    meta: PaginationMeta.describe("Pagination information"),
  });
};

/**
 * Example: Generic wrapper factory (different pattern)
 */
export function wrapInEnvelope<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.object({
    success: z.boolean().describe("Request success status"),
    data: dataSchema.describe("Response data"),
    timestamp: z.string().datetime().describe("Response timestamp"),
  });
}
