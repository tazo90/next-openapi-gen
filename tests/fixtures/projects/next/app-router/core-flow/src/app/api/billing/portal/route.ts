import type {
  BillingPortalSession,
  CreateBillingPortalSessionBody,
} from "../../../../schemas/saas";

type NextRequest = Request;

type NextResponse<T> = Response;

const NextResponse = {
  json<T>(body: T, init?: ResponseInit) {
    return Response.json(body, init) as NextResponse<T>;
  },
};

/**
 * Create billing portal session
 * @description Creates a billing portal session for the signed-in workspace owner
 * @body CreateBillingPortalSessionBody
 * @bodyDescription Billing session payload with the return URL
 * @response 201:BillingPortalSession:Billing portal session created
 * @auth bearer,basic
 * @tag Billing
 * @openapi
 */
export async function POST(request: NextRequest): Promise<NextResponse<BillingPortalSession>> {
  const body = (await request.json()) as CreateBillingPortalSessionBody;

  return NextResponse.json(
    {
      url: `${body.returnUrl}?portal=1`,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    },
    { status: 201 },
  );
}
