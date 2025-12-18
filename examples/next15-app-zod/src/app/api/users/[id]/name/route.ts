import { NextRequest, NextResponse } from "next/server";
import { getUserNameById } from "./route.utils";

type UserIdParam = {
  id: string; // User ID
};

type UserNameByIdResponse = Awaited<ReturnType<typeof getUserNameById>>;

/**
 * Get User Name by ID
 * @description Retrieves a user's name information
 * @pathParams UserIdParam
 * @response UserNameByIdResponse
 * @openapi
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await getUserNameById(params.id);
  return NextResponse.json(user);
}
