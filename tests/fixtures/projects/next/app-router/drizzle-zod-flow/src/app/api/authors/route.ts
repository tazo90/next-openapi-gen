import {
  AuthorBatchStatusUpdateSchema,
  AuthorResponseSchema,
  AuthorsQueryParams,
  CreateAuthorSchema,
} from "../../../schemas/author";

/**
 * List authors
 * @description Lists authors with filtering and sorting to broaden the drizzle-zod fixture.
 * @params AuthorsQueryParams
 * @response AuthorResponseSchema[]
 * @tag Authors
 * @openapi
 */
export async function GET() {
  AuthorsQueryParams.parse({
    page: "1",
    sort: "name",
  });

  return Response.json([
    {
      avatarUrl: "https://example.com/avatars/ada.png",
      bio: "Writes about ORMs and validation",
      createdAt: new Date("2026-03-01T09:00:00.000Z"),
      email: "ada@example.com",
      id: 1,
      name: "Ada Lovelace",
    },
  ]);
}

/**
 * Create author
 * @description Creates a new author using drizzle-zod insert schema generation.
 * @body CreateAuthorSchema
 * @response 201:AuthorResponseSchema
 * @tag Authors
 * @openapi
 */
export async function POST(request: Request) {
  const body = CreateAuthorSchema.parse(await request.json());

  return Response.json(
    {
      ...body,
      createdAt: new Date("2026-03-29T12:00:00.000Z"),
      id: 2,
    },
    { status: 201 },
  );
}

/**
 * Batch update author visibility
 * @description Demonstrates batch request bodies and non-CRUD mutations in the drizzle-zod fixture.
 * @body AuthorBatchStatusUpdateSchema
 * @response 204
 * @tag Authors
 * @operationId batchUpdateAuthorVisibility
 * @openapi
 */
export async function PATCH(request: Request) {
  AuthorBatchStatusUpdateSchema.parse(await request.json());
  return new Response(null, { status: 204 });
}
