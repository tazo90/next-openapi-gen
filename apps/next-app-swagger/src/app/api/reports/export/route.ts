type ReportExportQuery = {
  format?: "csv" | "ndjson";
};

type ReportExportBody = string;

/**
 * Export reports
 * @summary Export reports
 * @description Keeps the Swagger smoke app aligned with the richer baseline route surface.
 * @params ReportExportQuery
 * @response ReportExportBody
 * @responseContentType text/csv
 * @responseHeader 200 Content-Disposition string Attachment filename for the download
 * @servers https://api.example.com/v1, https://api-eu.example.com/v1
 * @externalDocs https://docs.example.com/reports/csv CSV export reference
 * @tag Reports
 * @tags Exports
 * @openapi
 */
export async function GET(request: Request) {
  const query = Object.fromEntries(
    new URL(request.url).searchParams.entries(),
  ) as ReportExportQuery;
  const format = query.format ?? "csv";

  return new Response(`id,format,status\nreport_1,${format},published\n`, {
    headers: {
      "content-type": "text/csv",
    },
    status: 200,
  });
}
