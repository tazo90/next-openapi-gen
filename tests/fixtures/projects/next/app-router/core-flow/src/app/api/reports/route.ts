import type { ReportsList } from "../../../schemas/user";

type NextResponse<T> = Response;

const NextResponse = {
  json<T>(body: T, init?: ResponseInit) {
    return Response.json(body, init) as NextResponse<T>;
  },
};

/**
 * List reports
 * @description Lists generated reports
 * @response ReportsList
 * @tag Reports
 * @openapi
 */
export async function GET(): Promise<NextResponse<ReportsList>> {
  return NextResponse.json({
    data: [
      {
        id: "report_1",
        generatedAt: new Date(),
      },
    ],
  });
}
