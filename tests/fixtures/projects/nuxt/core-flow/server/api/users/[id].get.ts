import type { User, UserIdParams } from "../../schemas/models";

/**
 * Load a single user.
 * @operationId nuxtGetUserById
 * @pathParams UserIdParams
 * @response User
 * @tag Users
 * @responseSet auth
 * @openapi
 */
export default defineEventHandler(() => ({}));
