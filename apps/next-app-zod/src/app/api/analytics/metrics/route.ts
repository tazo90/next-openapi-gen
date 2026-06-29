import { MetricQueryBody, MetricQueryResponse, MetricSummaryPatch } from "@/schemas/analytics";
import { NextResponse } from "next/server";

/**
 * Query metrics
 * @summary Aggregate metrics
 * @description Aggregates time-series samples for the requested metrics and window.
 * @tag Analytics
 * @tags Platform, Observability
 * @body MetricQueryBody
 * @response MetricQueryResponse
 * @response 4XX:AuthErrorResponse:Authorization or validation error
 * @responseHeader 200 X-Cache-Status string Cache hit or miss for this aggregation
 * @responseHeader 200 X-RateLimit-Remaining integer Remaining requests in the current window
 * @servers https://api.example.com/v1
 * @auth bearer
 * @operationId zodQueryMetrics
 * @openapi
 */
export async function POST(request: Request) {
  MetricQueryBody.parse(await request.json());
  return NextResponse.json({});
}

/**
 * Update dashboard summary
 * @summary Patch dashboard summary
 * @description Partially updates the metrics dashboard metadata using `.deepPartial()` semantics.
 * @tag Analytics
 * @body MetricSummaryPatch
 * @response MetricQueryResponse
 * @auth bearer
 * @operationId zodPatchMetricSummary
 * @openapi
 */
export async function PATCH(request: Request) {
  MetricSummaryPatch.parse(await request.json());
  return NextResponse.json({});
}
