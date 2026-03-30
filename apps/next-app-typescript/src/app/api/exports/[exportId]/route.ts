import type { CsvExportBody, ExportDownloadQuery, ExportIdParam } from "@/types/transport";

type ExportRouteContext = {
  params: Promise<ExportIdParam>;
};

/**
 * Download an export payload.
 * @description Returns a CSV export body using an explicit non-JSON media type.
 * @pathParams ExportIdParam
 * @params ExportDownloadQuery
 * @response CsvExportBody
 * @responseContentType text/csv
 * @tag Exports
 * @operationId typescriptDownloadExport
 * @responseSet common
 * @openapi
 */
export async function GET(request: Request, { params }: ExportRouteContext) {
  const { exportId } = await params;
  const query = Object.fromEntries(
    new URL(request.url).searchParams.entries(),
  ) as ExportDownloadQuery;
  const format = query.format ?? "csv";

  const body = ["id,format,status", `${exportId},${format},ready`].join(
    "\n",
  ) satisfies CsvExportBody;

  return new Response(body, {
    headers: {
      "content-disposition": `attachment; filename="${exportId}.${format}"`,
      "content-type": "text/csv",
    },
    status: 200,
  });
}
