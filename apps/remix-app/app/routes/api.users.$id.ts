import type { UpdateUserInput, User, UserIdParams } from "../schemas/models";

/**
 * Load a user.
 * @operationId remixAppGetUser
 * @pathParams UserIdParams
 * @response User
 * @tag Users
 * @openapi
 */
export async function loader(_params: UserIdParams): Promise<User> {
  return { id: "1", email: "ada@example.com" };
}

/**
 * Update a user.
 * @operationId remixAppUpdateUser
 * @pathParams UserIdParams
 * @body UpdateUserInput
 * @response User
 * @tag Users
 * @openapi
 */
export async function action(_params: UserIdParams, _body: UpdateUserInput): Promise<User> {
  return { id: "1", email: "ada@example.com" };
}
