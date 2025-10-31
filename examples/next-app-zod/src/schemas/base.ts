import { z } from "zod";

// Generic pagination types
export type PaginatedResponse<T> = {
  data: T[];
  pagination: {
    total: number;
    pages: number;
    page: number;
    limit: number;
  };
};

export const PaginationSchema = z.object({
  page: z.number().int().min(1),
  limit: z.number().int().min(1),
});
