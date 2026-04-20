import type { NextApiRequest, NextApiResponse } from "next";

/**
 * Get all users
 * @summary List users
 * @description Retrieve a list of all users with optional filtering
 * @tag Users
 * @tags Pages router
 * @params UserListParamsSchema
 * @header UserRequestHeadersSchema
 * @cookie UserCookiesSchema
 * @response UserSchema[]
 * @response 4XX:UserErrorResponseSchema:Any client error
 * @response default:UserErrorResponseSchema:Fallback error envelope
 * @responseHeader 200 X-Total-Count integer Total users in the result set
 * @responseHeader 429 Retry-After integer Seconds to wait before retrying
 * @method GET
 * @openapi
 */
/**
 * Create a new user
 * @summary Create user
 * @description Create a new user account
 * @tag Users
 * @body CreateUserSchema
 * @header UserRequestHeadersSchema
 * @response 201:UserSchema
 * @responseHeader 201 Location string URL of the created user
 * @method POST
 * @openapi
 */
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    // Get all users
    res.status(200).json([
      {
        id: "1",
        name: "John Doe",
        email: "john@example.com",
        createdAt: new Date().toISOString(),
      },
    ]);
  } else if (req.method === "POST") {
    // Create new user
    const { name, email, password } = req.body;
    res.status(201).json({
      id: "2",
      name,
      email,
      createdAt: new Date().toISOString(),
    });
  } else {
    res.setHeader("Allow", ["GET", "POST"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
