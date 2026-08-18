import type { UpdateUserInput, User, UserIdParams } from "../../../../schemas/models";

/**
 * Load a single user.
 * @operationId sveltekitGetUserById
 * @pathParams UserIdParams
 * @response User
 * @tag Users
 * @responseSet auth
 * @openapi
 */
export async function GET() {}

/**
 * Update a single user.
 * @operationId sveltekitUpdateUserById
 * @pathParams UserIdParams
 * @body UpdateUserInput
 * @response User
 * @tag Users
 * @responseSet auth
 * @openapi
 */
export async function POST() {}
