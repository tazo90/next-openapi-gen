import { MiniUserSchema } from "@/schemas/mini-user";
import { NextResponse } from "next/server";

/**
 * Get a sample user defined with Zod Mini functional APIs
 * @description Demonstrates zod/mini extend, optional, nullable, and .check() refinements
 * @response MiniUserSchema
 * @openapi
 */
export async function GET() {
  const user = MiniUserSchema.parse({
    id: "550e8400-e29b-41d4-a716-446655440000",
    email: "mini@example.com",
    displayName: "Mini User",
    bio: null,
  });

  return NextResponse.json(user);
}
