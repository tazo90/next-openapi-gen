import { NextRequest, NextResponse } from "next/server";

/**
 * Get user roles
 * @summary List roles
 * @description Get all available roles (uses custom YAML schema). Supports both JSON and XML representations via the `@xml` annotation on `Role`.
 * @response Role[]
 * @responseContentType application/json, application/xml
 * @xml Role
 * @tag Roles
 * @tags Identity
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
