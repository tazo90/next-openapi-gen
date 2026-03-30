type NextRequest = Request;

type NextResponse<T> = Response;

const NextResponse = {
  json<T>(body: T, init?: ResponseInit) {
    return Response.json(body, init) as NextResponse<T>;
  },
};

type PostResponse = {
  id: number;
  title: string;
  slug: string;
  published: boolean;
};

type PostParams = {
  id: string;
};

type RouteContext = {
  params: Promise<PostParams>;
};

/**
 * Get post by ID
 * @description Auto-infers the response schema from the typed NextResponse signature
 * @pathParams PostParams
 * @openapi
 */
export async function GET(
  _request: NextRequest,
  { params }: RouteContext,
): Promise<NextResponse<PostResponse>> {
  const { id } = await params;

  return NextResponse.json({
    id: Number(id),
    title: "Fixture Post",
    slug: "fixture-post",
    published: true,
  });
}
