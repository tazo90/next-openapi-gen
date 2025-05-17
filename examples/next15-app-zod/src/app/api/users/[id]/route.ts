import { UpdateUserBody, UserFieldsQuery, UserIdParams } from "@/schemas/user";
import { NextRequest, NextResponse } from "next/server";

/**
 * Get user by ID
 * @desc Retrieves detailed user information
 * @pathParams UserIdParams
 * @params UserFieldsQuery
 * @response UserDetailedSchema
 * @openapi
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  // Validate path parameters
  const pathResult = UserIdParams.safeParse({ id: params.id });

  if (!pathResult.success) {
    return NextResponse.json(
      { error: "Invalid user ID", details: pathResult.error.format() },
      { status: 400 }
    );
  }

  // Parse and validate query parameters
  const { searchParams } = new URL(request.url);
  const fieldsParam = searchParams.get("fields");

  const queryResult = UserFieldsQuery.safeParse({
    fields: fieldsParam,
  });

  if (!queryResult.success) {
    return NextResponse.json(
      {
        error: "Invalid query parameters",
        details: queryResult.error.format(),
      },
      { status: 400 }
    );
  }

  const userData = {
    id: params.id,
    email: "john.doe@example.com",
    name: "John Doe",
    role: "user",
    phone: "+1 555 123 4567",
    birthDate: new Date("1990-01-01"),
    addresses: [
      {
        street: "Main Street",
        houseNumber: "42A",
        city: "New York",
        postalCode: "10001",
        country: "USA",
      },
    ],
    primaryAddress: 0,
    preferences: {
      language: "en",
      theme: "system",
      notifications: true,
    },
    paymentMethods: [
      {
        type: "card",
        cardNumber: "4242 4242 4242 4242",
        expiryDate: "12/25",
        cardholderName: "John Doe",
      },
    ],
    createdAt: new Date("2023-01-15T12:00:00Z"),
    updatedAt: new Date("2023-05-20T15:30:00Z"),
  };

  // Filter fields if requested
  let responseData = userData;
  if (fieldsParam) {
    const fields = fieldsParam.split(",");
    responseData = { id: userData.id }; // ID is always included

    fields.forEach((field) => {
      if (field in userData && field !== "id") {
        responseData[field] = userData[field];
      }
    });
  }

  return NextResponse.json(responseData);
}

/**
 * Update user
 * @desc Updates user information
 * @pathParams UserIdParams
 * @body UpdateUserBody
 * @response UserDetailedSchema
 * @auth bearer
 * @openapi
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  // Validate path parameters
  const pathResult = UserIdParams.safeParse({ id: params.id });

  if (!pathResult.success) {
    return NextResponse.json(
      { error: "Invalid user ID", details: pathResult.error.format() },
      { status: 400 }
    );
  }

  try {
    // Parse and validate request body
    const body = await request.json();
    const bodyResult = UpdateUserBody.safeParse(body);

    if (!bodyResult.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: bodyResult.error.format() },
        { status: 400 }
      );
    }

    const currentUser = {
      id: params.id,
      email: "john.doe@example.com",
      name: "John Doe",
      role: "user",
      phone: "+1 555 123 4567",
      preferences: {
        language: "en",
        theme: "system",
        notifications: true,
      },
      createdAt: new Date("2023-01-15T12:00:00Z"),
      updatedAt: new Date(),
    };

    // Update user data with the provided fields
    const updatedUser = {
      ...currentUser,
      ...bodyResult.data,
      preferences: {
        ...currentUser.preferences,
        ...bodyResult.data.preferences,
      },
      updatedAt: new Date(),
    };

    return NextResponse.json(updatedUser);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to parse request body" },
      { status: 400 }
    );
  }
}

/**
 * Delete user
 * @desc Deletes a user account
 * @pathParams UserIdParams
 * @auth bearer
 * @openapi
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  // Validate path parameters
  const pathResult = UserIdParams.safeParse({ id: params.id });

  if (!pathResult.success) {
    return NextResponse.json(
      { error: "Invalid user ID", details: pathResult.error.format() },
      { status: 400 }
    );
  }

  return NextResponse.json(
    { success: true, message: "User successfully deleted" },
    { status: 200 }
  );
}
