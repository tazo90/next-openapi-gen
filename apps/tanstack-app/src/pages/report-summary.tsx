import { getRouteApi } from "@tanstack/react-router";

import type { ReportIdParams } from "../schemas/models";

const reportSummaryRoute = getRouteApi("/api/reports/$reportId/summary");

export function ReportSummaryRoute() {
  const report = reportSummaryRoute.useLoaderData();
  const params = reportSummaryRoute.useParams() satisfies ReportIdParams;

  return (
    <main>
      <h1>Report {params.reportId}</h1>
      <pre>{JSON.stringify(report, null, 2)}</pre>
    </main>
  );
}
