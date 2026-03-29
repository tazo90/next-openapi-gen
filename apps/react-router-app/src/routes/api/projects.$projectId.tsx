import type { Project, ProjectIdParams, ProjectMutationInput } from "../../schemas/models";

/**
 * Load a project.
 * @operationId reactRouterGetProjectById
 * @pathParams ProjectIdParams
 * @response Project
 * @tag Projects
 * @responseSet auth
 * @openapi
 */
export async function loader() {
  return {
    id: "project_123",
    name: "OpenAPI launchpad",
    visibility: "private",
  } satisfies Project;
}

/**
 * Update a project.
 * @operationId reactRouterUpdateProjectById
 * @pathParams ProjectIdParams
 * @body ProjectMutationInput
 * @response Project
 * @tag Projects
 * @responseSet auth
 * @openapi
 */
export async function action() {
  return {
    id: "project_123",
    name: "OpenAPI launchpad",
    visibility: "private",
  } satisfies Project;
}

export default function ProjectRoute() {
  const params = {
    projectId: "project_123",
  } satisfies ProjectIdParams;
  const payload = {
    name: "OpenAPI launchpad",
    visibility: "private",
  } satisfies ProjectMutationInput;

  return (
    <main>
      <h1>Project {params.projectId}</h1>
      <pre>{JSON.stringify({ payload }, null, 2)}</pre>
    </main>
  );
}
