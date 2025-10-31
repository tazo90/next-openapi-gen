import { NextRequest, NextResponse } from "next/server";

/**
 * Get all users
 * @description Retrieve paginated list of users (uses Zod schema)
 * @params PaginationParams
 * @response PaginatedResponse<UserSchema>
 * @tag Users
 * @openapi
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const page = Number(searchParams.get("page")) || 1;
  const limit = Number(searchParams.get("limit")) || 10;

  return NextResponse.json({
    data: [
      {
        id: "123e4567-e89b-12d3-a456-426614174000",
        email: "john@example.com",
        name: "John Doe",
        roleId: "role-uuid-here",
        isActive: true,
        createdAt: new Date(),
      },
    ],
    total: 1,
    page,
    limit,
    totalPages: 1,
  });
}

/**
 * Create new user
 * @description Create a new user account (uses Zod schema + Role from YAML)
 * @body CreateUserSchema
 * @response 201:UserSchema:User created successfully
 * @tag Users
 * @openapi
 */
export async function POST(request: NextRequest) {
  const body = await request.json();

  return NextResponse.json(
    {
      id: "123e4567-e89b-12d3-a456-426614174000",
      ...body,
      createdAt: new Date(),
    },
    { status: 201 }
  );
}
