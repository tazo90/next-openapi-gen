import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const LoginRequest = z.object({
  email: z.string().email().describe("User email address"),
  password: z.string().min(6).describe("User password"),
});

export const LoginResponse = z.object({
  token: z.string().describe("JWT access token"),
  user: z.object({
    id: z.string().describe("User ID"),
    email: z.string().email().describe("User email"),
    name: z.string().describe("User full name"),
  }).describe("User information"),
});

/**
 * User login
 * @description Authenticate user and return access token
 * @body LoginRequest
 * @response LoginResponse
 * @tag Authentication
 * @openapi
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  
  return NextResponse.json({
    token: "jwt-token-here",
    user: {
      id: "user-123",
      email: body.email,
      name: "John Doe",
    },
  });
}