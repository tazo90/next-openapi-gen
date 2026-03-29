import type { ProjectShareIdParams } from "@/schemas/project";

type ProjectShareRouteContext = {
  params: Promise<ProjectShareIdParams>;
};

/**
 * Redirect to a project share page.
 * @description Demonstrates nested route generation through the next.config.ts config entrypoint.
 * @pathParams ProjectShareIdParams
 * @response 307
 * @tag Projects
 * @operationId nextConfigRedirectProjectShare
 * @openapi
 */
export async function GET(_request: Request, { params }: ProjectShareRouteContext) {
  const { id } = await params;
  return Response.redirect(`https://example.com/projects/${id}/share`, 307);
}
