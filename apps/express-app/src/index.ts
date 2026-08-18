import type { UpdateUserInput, User, UserIdParams } from "./schemas/models";

const app = {
  get(_path: string, _handler: (...args: unknown[]) => unknown) {},
  post(_path: string, _handler: (...args: unknown[]) => unknown) {},
};

/**
 * Load a user.
 * @operationId expressAppGetUser
 * @pathParams UserIdParams
 * @response User
 * @tag Users
 * @openapi
 */
app.get("/users/:id", (_params: UserIdParams) => ({ id: "1", email: "ada@example.com" }));

/**
 * Update a user.
 * @operationId expressAppUpdateUser
 * @pathParams UserIdParams
 * @body UpdateUserInput
 * @response User
 * @tag Users
 * @openapi
 */
app.post("/users/:id", () => ({}));

export default app;
