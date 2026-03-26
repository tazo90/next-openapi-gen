import type { NextApiRequest, NextApiResponse } from "next";

/**
 * Get user by ID
 * @description Retrieve a specific user by their ID
 * @pathParams UserIdParamsSchema
 * @response UserSchema
 * @method GET
 * @openapi
 */
/**
 * Update user
 * @description Update an existing user's information
 * @pathParams UserIdParamsSchema
 * @body UpdateUserSchema
 * @response UserSchema
 * @method PUT
 * @openapi
 */
/**
 * Delete user
 * @description Remove a user from the system
 * @pathParams UserIdParamsSchema
 * @response 204
 * @method DELETE
 * @openapi
 */
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;

  if (req.method === "GET") {
    // Get user by ID
    res.status(200).json({
      id: id as string,
      name: "John Doe",
      email: "john@example.com",
      createdAt: new Date().toISOString(),
    });
  } else if (req.method === "PUT") {
    // Update user
    const { name, email } = req.body;
    res.status(200).json({
      id: id as string,
      name: name || "John Doe",
      email: email || "john@example.com",
      createdAt: new Date().toISOString(),
    });
  } else if (req.method === "DELETE") {
    // Delete user
    res.status(204).end();
  } else {
    res.setHeader("Allow", ["GET", "PUT", "DELETE"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
