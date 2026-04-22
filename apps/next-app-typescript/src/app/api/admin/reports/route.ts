import { NextRequest, NextResponse } from "next/server";

import type { AdminReportsResponse, CreateAdminReportBody } from "@/types/admin-reports";

/**
 * List admin reports
 * @summary List reports
 * @description Lists every admin-visible report. Demonstrates multi-scheme OR security and `@servers`.
 * @tag Admin
 * @tags Reports
 * @response AdminReportsResponse
 * @response 4XX:ErrorResponse:Any client error
 * @response 5XX:ErrorResponse:Any server error
 * @responseHeader 200 X-Request-Id string Request identifier for tracing
 * @security BearerAuth, ApiKeyAuth:read:reports|write:reports
 * @servers https://admin.example.com/v1, https://admin-eu.example.com/v1
 * @externalDocs https://docs.example.com/admin/reports Admin report runbook
 * @operationId tsListAdminReports
 * @openapi
 */
export async function GET(_request: NextRequest) {
  return NextResponse.json({});
}

/**
 * Create admin report
 * @summary Create report
 * @description Schedules a new admin report generation.
 * @tag Admin
 * @body CreateAdminReportBody
 * @response 202:AdminReport:Report generation queued
 * @responseHeader 202 Location string URL where the generated report will be available
 * @link 202 listReports tsListAdminReports
 * @security BearerAuth, ApiKeyAuth:write:reports
 * @operationId tsCreateAdminReport
 * @openapi
 */
export async function POST(_request: NextRequest) {
  return NextResponse.json({}, { status: 202 });
}
