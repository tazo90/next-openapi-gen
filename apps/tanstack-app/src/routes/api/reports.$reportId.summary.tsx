import { createFileRoute } from "@tanstack/react-router";

import type { ReportIdParams, ReportSummary } from "../../schemas/models";

/**
 * Load a report summary.
 * @operationId tanstackGetReportSummary
 * @pathParams ReportIdParams
 * @response ReportSummary
 * @tag Reports
 * @responseSet common
 * @openapi
 */
export async function loader() {
  return {
    id: "report_123",
    status: "published",
    title: "Quarterly business review",
    updatedAt: "2026-03-29T12:00:00.000Z",
  } satisfies ReportSummary;
}

export const Route = createFileRoute("/api/reports/$reportId/summary")({
  component: ReportSummaryRoute,
  loader,
});

function ReportSummaryRoute() {
  const report = Route.useLoaderData();
  const params = Route.useParams() satisfies ReportIdParams;

  return (
    <main>
      <h1>Report {params.reportId}</h1>
      <pre>{JSON.stringify(report, null, 2)}</pre>
    </main>
  );
}
