import type { ReportIdParams, ReportSummary } from "../../../../schemas/models";

/**
 * Load a report summary.
 * @operationId astroGetReportSummary
 * @pathParams ReportIdParams
 * @response ReportSummary
 * @tag Reports
 * @responseSet common
 * @openapi
 */
export const GET = () => new Response();
