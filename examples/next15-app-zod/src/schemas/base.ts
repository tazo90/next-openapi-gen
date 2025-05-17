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
