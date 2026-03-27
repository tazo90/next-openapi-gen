import type { ReportIdParams, ReportSummary } from "../../../../../schemas/user";

type NextResponse<T> = Response;

const NextResponse = {
  json<T>(body: T, init?: ResponseInit) {
    return Response.json(body, init) as NextResponse<T>;
  },
};

type RouteContext = {
  params: Promise<ReportIdParams>;
};

/**
 * Get report summary
 * @description Retrieves a single report summary
 * @pathParams ReportIdParams
 * @response ReportSummary
 * @tag Reports
 * @openapi
 */
export async function GET(
  _request: Request,
  { params }: RouteContext,
): Promise<NextResponse<ReportSummary>> {
  const { id } = await params;

  return NextResponse.json({
    id,
    generatedAt: new Date(),
  });
}
