import type { UpdateUserInput, User, UserIdParams } from "../schemas/models";

/**
 * Load a single user.
 * @operationId remixGetUserById
 * @pathParams UserIdParams
 * @response User
 * @tag Users
 * @responseSet auth
 * @openapi
 */
export async function loader() {}

/**
 * Update a single user.
 * @operationId remixUpdateUserById
 * @pathParams UserIdParams
 * @body UpdateUserInput
 * @response User
 * @tag Users
 * @responseSet auth
 * @openapi
 */
export async function action() {}
