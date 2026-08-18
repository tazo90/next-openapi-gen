import type { UpdateUserInput, User, UserIdParams } from "../../schemas/models";

function defineEventHandler<T>(handler: () => T) {
  return handler;
}

/**
 * Update a user.
 * @operationId nuxtAppUpdateUser
 * @pathParams UserIdParams
 * @body UpdateUserInput
 * @response User
 * @tag Users
 * @openapi
 */
export default defineEventHandler((_params: UserIdParams, _body: UpdateUserInput): User => ({
  id: "1",
  email: "ada@example.com",
}));
