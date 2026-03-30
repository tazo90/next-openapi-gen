import type { UpdateUserInput, User, UserIdParams } from "../../schemas/models";

/**
 * Load a single user.
 * @operationId tanstackGetUserById
 * @pathParams UserIdParams
 * @response User
 * @tag Users
 * @responseSet auth
 * @openapi
 */
export async function loader() {}

/**
 * Update a single user.
 * @operationId tanstackUpdateUserById
 * @pathParams UserIdParams
 * @body UpdateUserInput
 * @response User
 * @tag Users
 * @responseSet auth
 * @openapi
 */
export async function action() {}
