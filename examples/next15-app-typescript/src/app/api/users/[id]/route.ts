import { NextRequest, NextResponse } from "next/server";

/**
 * Get User by ID
 * @description Retrieves a user's profile information
 * @pathParams UserIdParam
 * @response UserResponse
 * @openapi
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // In a real app, you would fetch user data from a database
  const user = {
    id,
    name: "John Doe",
    email: "john.doe@example.com",
    role: "user",
  };

  return NextResponse.json(user);
}
