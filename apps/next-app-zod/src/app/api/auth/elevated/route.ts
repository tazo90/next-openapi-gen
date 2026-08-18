import { NextResponse } from "next/server";

/**
 * Inspect an elevated session
 * @summary Elevated session
 * @description Requires both a bearer token and the session cookie.
 * @tag Auth
 * @auth bearer;SessionCookie
 * @response SessionResponse
 * @operationId zodGetElevatedSession
 * @openapi
 */
export async function GET() {
  return NextResponse.json({});
}
