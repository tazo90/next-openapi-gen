export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface Order {
  id: string;
  totalAmount: number;
  createdAt: Date;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
}
