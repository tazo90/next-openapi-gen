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
export async function loader() {}

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
export async function action() {}
