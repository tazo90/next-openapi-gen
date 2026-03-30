type ReportExportQuery = {
  format?: "csv" | "ndjson";
};

type ReportExportBody = string;

/**
 * Export reports
 * @description Keeps the Swagger smoke app aligned with the richer baseline route surface.
 * @params ReportExportQuery
 * @response ReportExportBody
 * @responseContentType text/csv
 * @tag Reports
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
