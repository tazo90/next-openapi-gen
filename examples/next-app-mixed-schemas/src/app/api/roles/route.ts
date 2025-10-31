import { NextRequest, NextResponse } from "next/server";

/**
 * Get user roles
 * @description Get all available roles (uses custom YAML schema)
 * @response Role[]
 * @tag Roles
 * @openapi
 */
export async function GET(request: NextRequest) {
  return NextResponse.json([
    {
      id: "role-123",
      name: "admin",
      permissions: ["read", "write", "delete", "admin"],
      createdAt: new Date().toISOString(),
    },
    {
      id: "role-456",
      name: "user",
      permissions: ["read", "write"],
      createdAt: new Date().toISOString(),
    },
  ]);
}
