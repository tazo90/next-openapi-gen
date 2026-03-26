import type { NextApiRequest, NextApiResponse } from "next";

/**
 * Get all users
 * @description Retrieve a list of all users with optional filtering
 * @params UserListParamsSchema
 * @response UserSchema[]
 * @method GET
 * @openapi
 */
/**
 * Create a new user
 * @description Create a new user account
 * @body CreateUserSchema
 * @response 201:UserSchema
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
