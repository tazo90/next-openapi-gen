import type { Project } from "../../schemas/models";

/**
 * Load a project.
 * @summary Get project
 * @tags Projects, Workspace
 * @operationId reactRouterGetProjectById
 * @pathParams ProjectIdParams
 * @response Project
 * @responseHeader 200 X-Request-Id string Trace identifier
 * @link 200 updateProject reactRouterUpdateProjectById
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
