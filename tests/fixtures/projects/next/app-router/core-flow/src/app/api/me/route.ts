import { getCurrentUserForRequest } from "../../../schemas/auth-service";
import type { CurrentUserResponse } from "../../../schemas/saas";

type NextRequest = Request;

type NextResponse<T> = Response;

const NextResponse = {
  json<T>(body: T, init?: ResponseInit) {
    return Response.json(body, init) as NextResponse<T>;
  },
};

function getApiBearerToken(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  return authHeader?.replace(/^Bearer\s+/i, "");
}

/**
 * Get the current authenticated user.
 * @description Return the currently authenticated user for the active request. Accepts a bearer token for API clients while continuing to support the current browser session.
 * @operationId getCurrentUser
 * @tag Users
 * @auth SessionCookie,bearer
 * @response CurrentUserResponse
 * @responseDescription Returns the current authenticated user.
 * @responseSet auth
 * @openapi
 */
export async function GET(request: NextRequest): Promise<NextResponse<CurrentUserResponse>> {
  const accessToken = getApiBearerToken(request);
  const result = await getCurrentUserForRequest(accessToken);

  return NextResponse.json(result);
}
