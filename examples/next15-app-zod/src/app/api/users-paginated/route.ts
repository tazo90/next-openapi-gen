import { NextRequest, NextResponse } from "next/server";

/**
 * Get paginated users
 * @description Retrieve users with cursor-based pagination using factory-generated schema
 * @params PaginationMeta
 * @response PaginatedUsersSchema
 * @openapi
 */
export async function GET(request: NextRequest) {
  // Example response matching the PaginatedUsersSchema
  return NextResponse.json({
    data: [
      {
        id: "550e8400-e29b-41d4-a716-446655440000",
        email: "john.doe@example.com",
        name: "John Doe",
        role: "user",
        phone: "+48 123 456 789",
        birthDate: "1990-01-15",
        addresses: [
          {
            street: "Main Street",
            houseNumber: "42",
            city: "Warsaw",
            postalCode: "00-001",
            country: "Poland",
          },
        ],
        primaryAddress: 0,
        preferences: {
          language: "en",
          theme: "dark",
          notifications: true,
        },
        paymentMethods: [],
        createdAt: "2023-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
      },
      {
        id: "660e8400-e29b-41d4-a716-446655440111",
        email: "jane.smith@example.com",
        name: "Jane Smith",
        role: "admin",
        createdAt: "2023-06-15T00:00:00Z",
        updatedAt: "2024-01-15T00:00:00Z",
      },
    ],
    pagination: {
      nextCursor: "eyJpZCI6IjY2MGU4NDAwLWUyOWItNDFkNC1hNzE2LTQ0NjY1NTQ0MDExMSJ9",
      hasMore: true,
      limit: 10,
      total: 42,
    },
  });
}
