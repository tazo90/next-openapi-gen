import { NextResponse } from "next/server";
import { z } from "zod";

const GetUserProfilePathParams = z.object({
  id: z.string().describe("User ID"),
});

const Users = z.object({
  id: z.string().describe("User ID"),
  name: z.string(),
});

/**
 * Read the user profile
 * @auth bearer
 * @description Detailed user profile
 * @pathParams GetUserProfilePathParams
 * @response Users
 * @responseDescription Test
 * @responseSet common,auth
 * @add 409
 * @openapi
 */
export async function GET() {
  return NextResponse.json({});
}
