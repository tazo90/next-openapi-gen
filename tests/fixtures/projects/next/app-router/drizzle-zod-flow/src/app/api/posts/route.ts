import { CreatePostSchema, PostResponseSchema, PostsQueryParams } from "../../../schemas/post";

/**
 * List posts
 * @description Retrieves a paginated list of blog posts backed by drizzle-zod schemas.
 * @params PostsQueryParams
 * @response PostResponseSchema[]
 * @responseDescription List of blog posts
 * @tag Posts
 * @openapi
 */
export async function GET() {
  return Response.json([
    {
      id: 1,
      title: "Getting Started with Drizzle ORM",
      slug: "getting-started-drizzle-orm",
      excerpt: "Learn how to use Drizzle ORM with Next.js",
      content: "Full content here...",
      published: true,
      viewCount: 150,
      authorId: 1,
      createdAt: new Date("2026-03-01T09:00:00.000Z"),
      updatedAt: new Date("2026-03-02T09:00:00.000Z"),
    },
  ]);
}

/**
 * Create post
 * @description Creates a new blog post using drizzle-zod insert schema generation.
 * @body CreatePostSchema
 * @response 201:PostResponseSchema:Post created successfully
 * @tag Posts
 * @openapi
 */
export async function POST(request: Request) {
  const body = CreatePostSchema.parse(await request.json());
  return Response.json(
    {
      id: 3,
      ...body,
      viewCount: 0,
      createdAt: new Date("2026-03-29T12:00:00.000Z"),
      updatedAt: new Date("2026-03-29T12:00:00.000Z"),
    },
    { status: 201 },
  );
}
