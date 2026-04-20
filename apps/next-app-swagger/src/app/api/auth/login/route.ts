type LoginBody = {
  email: string; // user email
  password: string; // user password
};

type LoginResponse = {
  token: string; // auth token
  refresh_token: string; // refresh token
};

/**
 * Authenticate as a user.
 * @summary Sign in
 * @description Login a user
 * @tag Auth
 * @tags Sessions
 * @body LoginBody
 * @response LoginResponse
 * @responseHeader 200 Set-Cookie string Issued session cookie
 * @link 200 currentUser swaggerGetCurrentUser
 * @security BasicAuth, BearerAuth
 * @operationId swaggerLogin
 * @openapi
 */
export async function POST(req: Request) {
  return Response.json({});
}
