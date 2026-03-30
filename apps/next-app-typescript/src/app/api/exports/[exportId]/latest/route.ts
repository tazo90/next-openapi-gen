import type { ExportIdParam } from "@/types/transport";

type ExportLatestRouteContext = {
  params: Promise<ExportIdParam>;
};

/**
 * Redirect to the latest export artifact.
 * @description Demonstrates redirect-style transport routes from typed route modules.
 * @pathParams ExportIdParam
 * @response 307
 * @tag Exports
 * @operationId typescriptRedirectLatestExport
 * @openapi
 */
export async function GET(_request: Request, { params }: ExportLatestRouteContext) {
  const { exportId } = await params;

  return Response.redirect(`https://downloads.example.com/exports/${exportId}.csv`, 307);
}
