import { NextRequest, NextResponse } from "next/server";

type UserRouteContext = {
  params: Promise<{ id: string }>;
};

/**
 * Get User by ID
 * @description Retrieves a user's profile information
 * @pathParams UserIdParam
 * @response UserResponse
 * @openapi
 */
export async function GET(request: NextRequest, { params }: UserRouteContext) {
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
