import type { UpdateUserInput, User, UserIdParams } from "../../schemas/models";

/**
 * Update a single user.
 * @operationId nuxtUpdateUserById
 * @pathParams UserIdParams
 * @body UpdateUserInput
 * @response User
 * @tag Users
 * @responseSet auth
 * @openapi
 */
export default defineEventHandler(() => ({}));
