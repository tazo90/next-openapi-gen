import {
  AuthErrorResponse,
  CreateSessionBody,
  SessionCookies,
  SessionRequestHeaders,
  SessionResponse,
} from "@/schemas/session";
import { NextResponse } from "next/server";

/**
 * Inspect current session
 * @summary Current session
 * @description Returns the currently authenticated session based on the session cookie and request headers.
 * @tag Sessions
 * @tags Auth, Platform
 * @header SessionRequestHeaders
 * @cookie SessionCookies
 * @response SessionResponse
 * @response 4XX:AuthErrorResponse:Any authentication error
 * @response default:AuthErrorResponse:Fallback error envelope
 * @responseHeader 200 ETag string Version of the session document
 * @responseHeader 401 WWW-Authenticate string Challenge scheme (Bearer)
 * @security BearerAuth, ApiKeyAuth
 * @operationId zodGetSession
 * @openapi
 */
export async function GET() {
  return NextResponse.json({});
}

/**
 * Create a session
 * @summary Sign in
 * @description Exchanges credentials for a fresh session token. Exercises `@link` for follow-up navigation.
 * @tag Sessions
 * @tags Auth
 * @body CreateSessionBody
 * @bodyDescription Credentials plus optional second factor
 * @response 201:SessionResponse:New session created
 * @response 4XX:AuthErrorResponse:Authentication failed
 * @response 5XX:AuthErrorResponse:Upstream auth provider failure
 * @responseHeader 201 Location string URL of the newly created session
 * @responseHeader 429 Retry-After integer Seconds to wait before retrying
 * @link 201 currentSession zodGetSession
 * @operationId zodCreateSession
 * @openapi
 */
export async function POST() {
  return NextResponse.json({}, { status: 201 });
}
