import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const AdminUserListResponse = z.object({
  users: z.array(z.object({
    id: z.string().describe("User ID"),
    email: z.string().email().describe("User email"),
    name: z.string().describe("User full name"),
    role: z.enum(["admin", "user"]).describe("User role"),
    status: z.enum(["active", "inactive", "banned"]).describe("User status"),
    createdAt: z.string().describe("Account creation date"),
  })).describe("List of users"),
  pagination: z.object({
    page: z.number().describe("Current page"),
    limit: z.number().describe("Items per page"),
    total: z.number().describe("Total number of users"),
  }).describe("Pagination information"),
});

export const AdminUserQuery = z.object({
  page: z.number().optional().describe("Page number"),
  limit: z.number().optional().describe("Items per page"),
  role: z.enum(["admin", "user"]).optional().describe("Filter by role"),
  status: z.enum(["active", "inactive", "banned"]).optional().describe("Filter by status"),
});

/**
 * List all users (Admin only)
 * @description Retrieves a paginated list of all users in the system
 * @params AdminUserQuery
 * @response AdminUserListResponse
 * @auth bearer
 * @tag Admin
 * @openapi
 */
export async function GET(request: NextRequest) {
  return NextResponse.json({
    users: [
      {
        id: "user-1",
        email: "john@example.com",
        name: "John Doe",
        role: "user",
        status: "active",
        createdAt: "2023-01-15T10:00:00Z",
      },
      {
        id: "user-2",
        email: "admin@example.com",
        name: "Admin User",
        role: "admin",
        status: "active",
        createdAt: "2023-01-01T00:00:00Z",
      },
    ],
    pagination: {
      page: 1,
      limit: 10,
      total: 2,
    },
  });
}