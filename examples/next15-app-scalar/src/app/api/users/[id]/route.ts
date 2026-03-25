import { NextRequest, NextResponse } from "next/server";

// Define path parameter type
export type UserIdParam = {
  id: string; // User's unique identifier
};

type UserAddress = {
  line1: string;
  line2?: string;
  city: string;
  postalCode: string;
};

// Define response type
export type UserResponse = {
  id: string; // User's unique identifier
  name: string; // User's full name
  email: string; // User's email address
  role: string; // User's role in the system
  address: UserAddress;
};

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
