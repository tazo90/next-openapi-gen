import type { User, UserIdParams } from "../../schemas/models";

function defineEventHandler<T>(handler: () => T) {
  return handler;
}

/**
 * Load a user.
 * @operationId nuxtAppGetUser
 * @pathParams UserIdParams
 * @response User
 * @tag Users
 * @openapi
 */
export default defineEventHandler(
  (_params: UserIdParams) =>
    ({
      id: "1",
      email: "ada@example.com",
    }),
);
