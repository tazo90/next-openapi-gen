import { createFileRoute } from "@tanstack/react-router";

import type { UpdateUserInput, User, UserIdParams } from "../../schemas/models";

/**
 * Load a single user.
 * @summary Get user
 * @tags Users, Identity
 * @operationId tanstackGetUserById
 * @pathParams UserIdParams
 * @response User
 * @responseHeader 200 X-Request-Id string Trace identifier
 * @link 200 updateUser tanstackUpdateUserById
 * @tag Users
 * @responseSet auth
 * @openapi
 */
export async function loader() {
  return {
    email: "ada@example.com",
    id: "user_123",
    role: "admin",
  } satisfies User;
}

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
export async function action() {
  return {
    email: "ada@example.com",
    id: "user_123",
    role: "admin",
  } satisfies User;
}

export const Route = createFileRoute("/api/users/$id")({
  component: UserRoute,
  loader,
});

function UserRoute() {
  const user = Route.useLoaderData();
  const params = Route.useParams() satisfies UserIdParams;
  const updateTemplate = {
    email: user.email,
    name: "Ada Lovelace",
  } satisfies UpdateUserInput;

  return (
    <main>
      <h1>User {params.id}</h1>
      <pre>{JSON.stringify({ updateTemplate, user }, null, 2)}</pre>
    </main>
  );
}
