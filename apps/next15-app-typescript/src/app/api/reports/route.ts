import { NextResponse } from "next/server";

/**
 * List reports
 * @description Returns a paginated list of reports. Requires both Bearer token and API key.
 * @params ReportQuery
 * @response ReportsResponse
 * @auth bearer,apikey
 * @openapi
 */
export async function GET() {
  return NextResponse.json({ data: [], total: 0 });
}

/**
 * Create report
 * @description Creates a new report. Requires Bearer token and a partner-specific token.
 * @body CreateReportBody
 * @response Report
 * @auth bearer,PartnerToken
 * @openapi
 */
export async function POST() {
  return NextResponse.json({ id: "1", title: "", generatedAt: "" });
}
