import type { UpdateUserInput, User, UserIdParams } from "../../../../schemas/models";

/**
 * Load a user.
 * @operationId sveltekitAppGetUser
 * @pathParams UserIdParams
 * @response User
 * @tag Users
 * @openapi
 */
export async function GET(_params: UserIdParams): Promise<User> {
  return { id: "1", email: "ada@example.com" };
}

/**
 * Update a user.
 * @operationId sveltekitAppUpdateUser
 * @pathParams UserIdParams
 * @body UpdateUserInput
 * @response User
 * @tag Users
 * @openapi
 */
export async function POST(_params: UserIdParams, _body: UpdateUserInput): Promise<User> {
  return { id: "1", email: "ada@example.com" };
}
