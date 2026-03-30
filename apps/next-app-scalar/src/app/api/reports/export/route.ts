type ReportExportQuery = {
  format?: "csv" | "ndjson";
};

/**
 * Export reports
 * @description Keeps the Scalar smoke app aligned with the richer baseline route surface.
 * @queryParams ReportExportQuery
 * @response string
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
