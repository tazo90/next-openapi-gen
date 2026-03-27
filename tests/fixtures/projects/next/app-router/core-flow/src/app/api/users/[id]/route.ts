import type { UserDetail, UserFieldsQuery, UserIdParams } from "../../../../schemas/user";

type NextRequest = Request & {
  nextUrl: URL;
};

type NextResponse<T> = Response;

const NextResponse = {
  json<T>(body: T, init?: ResponseInit) {
    return Response.json(body, init) as NextResponse<T>;
  },
};

type RouteContext = {
  params: Promise<UserIdParams>;
};

/**
 * Get user by ID
 * @description Retrieves a single user
 * @pathParams UserIdParams
 * @params UserFieldsQuery
 * @response UserDetail
 * @responseSet common
 * @auth bearer
 * @openapi
 */
export async function GET(
  request: NextRequest,
  { params }: RouteContext,
): Promise<NextResponse<UserDetail>> {
  const { id } = await params;
  const searchParams = request.nextUrl.searchParams;
  const include = (searchParams.get("include") as UserFieldsQuery["include"]) ?? "profile";
  const verbose = searchParams.get("verbose") === "true";

  return NextResponse.json({
    id,
    name: verbose ? "Verbose Example User" : "Example User",
    email: `${include}@example.com`,
    active: true,
  });
}

/**
 * Update user
 * @description Updates a single user
 * @pathParams UserIdParams
 * @body UpdateUserBody
 * @response UserDetail
 * @auth bearer
 * @openapi
 */
export async function PATCH(
  request: NextRequest,
  { params }: RouteContext,
): Promise<NextResponse<UserDetail>> {
  const { id } = await params;
  const body = (await request.json()) as Partial<UserDetail>;

  return NextResponse.json({
    id,
    name: body.name ?? "Updated User",
    email: body.email ?? "updated@example.com",
    active: body.active ?? true,
  });
}

/**
 * Delete user
 * @description Deletes a single user
 * @pathParams UserIdParams
 * @response 204
 * @auth bearer
 * @openapi
 */
export async function DELETE(_request: NextRequest, { params }: RouteContext): Promise<Response> {
  await params;

  return new Response(null, { status: 204 });
}
