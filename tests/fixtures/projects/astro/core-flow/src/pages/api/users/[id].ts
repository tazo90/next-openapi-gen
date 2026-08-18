import type { UpdateUserInput, User, UserIdParams } from "../../../schemas/models";

export const prerender = false;

/**
 * Load a single user.
 * @operationId astroGetUserById
 * @pathParams UserIdParams
 * @response User
 * @tag Users
 * @responseSet auth
 * @openapi
 */
export const GET = () => new Response();

/**
 * Update a single user.
 * @operationId astroUpdateUserById
 * @pathParams UserIdParams
 * @body UpdateUserInput
 * @response User
 * @tag Users
 * @responseSet auth
 * @openapi
 */
export const POST = () => new Response();
