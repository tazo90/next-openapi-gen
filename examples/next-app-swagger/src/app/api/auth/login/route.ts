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
 * @description Login a user
 * @body LoginBody
 * @response LoginResponse
 */
export async function POST(req: Request) {
  return Response.json({});
}
