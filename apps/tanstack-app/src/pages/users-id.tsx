import { getRouteApi } from "@tanstack/react-router";

import type { UpdateUserInput, UserIdParams } from "../schemas/models";

const userRoute = getRouteApi("/api/users/$id");

export function UserRoute() {
  const user = userRoute.useLoaderData();
  const params = userRoute.useParams() satisfies UserIdParams;
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
