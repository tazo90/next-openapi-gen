import type { CatalogExportBody, CatalogExportIdParams } from "@/schemas/catalog";

type CatalogExportRouteContext = {
  params: Promise<CatalogExportIdParams>;
};

/**
 * Export catalog item
 * @description Demonstrates richer adapter-triggered generation for nested App Router paths and text responses.
 * @pathParams CatalogExportIdParams
 * @response CatalogExportBody
 * @responseContentType text/csv
 * @tag Catalog
 * @operationId adapterExportCatalogItem
 * @openapi
 */
export async function GET(_request: Request, { params }: CatalogExportRouteContext) {
  const { id } = await params;
  const body = `id,name,status\n${id},Adapter-powered product,active\n` satisfies CatalogExportBody;

  return new Response(body, {
    headers: {
      "content-type": "text/csv",
    },
    status: 200,
  });
}
