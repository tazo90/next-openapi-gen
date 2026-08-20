import type { UpdateUserInput, User, UserIdParams } from "../../../schemas/models";

export const prerender = false;

/**
 * Load a user.
 * @operationId astroAppGetUser
 * @pathParams UserIdParams
 * @response User
 * @tag Users
 * @openapi
 */
export const GET = (_params: UserIdParams): Promise<User> =>
  Promise.resolve({ id: "1", email: "ada@example.com" });

/**
 * Update a user.
 * @operationId astroAppUpdateUser
 * @pathParams UserIdParams
 * @body UpdateUserInput
 * @response User
 * @tag Users
 * @openapi
 */
export const POST = (_params: UserIdParams, _body: UpdateUserInput): Promise<User> =>
  Promise.resolve({ id: "1", email: "ada@example.com" });
