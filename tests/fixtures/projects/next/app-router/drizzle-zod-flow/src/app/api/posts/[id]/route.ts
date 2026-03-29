import { PostIdParams, PostResponseSchema, UpdatePostSchema } from "../../../../schemas/post";

/**
 * Get post by ID
 * @description Retrieves a single blog post by its ID.
 * @pathParams PostIdParams
 * @response PostResponseSchema
 * @responseDescription Single blog post
 * @tag Posts
 * @openapi
 */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  PostIdParams.parse({ id });

  return Response.json({
    id: Number(id),
    title: "Getting Started with Drizzle ORM",
    slug: "getting-started-drizzle-orm",
    excerpt: "Learn how to use Drizzle ORM with Next.js",
    content: "Full content here...",
    published: true,
    viewCount: 150,
    authorId: 1,
    createdAt: new Date("2026-03-01T09:00:00.000Z"),
    updatedAt: new Date("2026-03-02T09:00:00.000Z"),
  });
}

/**
 * Update post
 * @description Updates an existing blog post.
 * @pathParams PostIdParams
 * @body UpdatePostSchema
 * @response PostResponseSchema
 * @responseDescription Updated post
 * @tag Posts
 * @openapi
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = UpdatePostSchema.parse(await request.json());
  PostIdParams.parse({ id });

  return Response.json({
    id: Number(id),
    title: "Getting Started with Drizzle ORM",
    slug: "getting-started-drizzle-orm",
    excerpt: "Learn how to use Drizzle ORM with Next.js",
    content: "Full content here...",
    published: true,
    viewCount: 150,
    authorId: 1,
    ...body,
    createdAt: new Date("2026-03-01T09:00:00.000Z"),
    updatedAt: new Date("2026-03-29T12:00:00.000Z"),
  });
}

/**
 * Delete post
 * @description Deletes a post by ID.
 * @pathParams PostIdParams
 * @response 204
 * @responseDescription Post deleted successfully
 * @tag Posts
 * @openapi
 */
export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  PostIdParams.parse({ id });
  return new Response(null, { status: 204 });
}
