import { NextRequest, NextResponse } from "next/server";
import {
  PostIdParams,
  PostResponseSchema,
  UpdatePostSchema,
} from "@/schemas/post";

/**
 * Get post by ID
 * @description Retrieve a single blog post by its ID
 * @pathParams PostIdParams
 * @response PostResponseSchema
 * @responseDescription Single blog post
 * @tag Posts
 * @openapi
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Validate path params
  PostIdParams.parse({ id });

  // Mock post data
  const post = {
    id: parseInt(id),
    title: "Getting Started with Drizzle ORM",
    slug: "getting-started-drizzle-orm",
    excerpt: "Learn how to use Drizzle ORM with Next.js",
    content: "# Getting Started\n\nThis is a complete guide...",
    published: true,
    viewCount: 150,
    authorId: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  return NextResponse.json(post);
}

/**
 * Update post
 * @description Update an existing blog post
 * @pathParams PostIdParams
 * @body UpdatePostSchema
 * @bodyDescription Fields to update
 * @response PostResponseSchema
 * @responseDescription Updated post
 * @tag Posts
 * @openapi
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    // Validate
    PostIdParams.parse({ id });
    const validated = UpdatePostSchema.parse(body);

    // Mock updated post
    const updatedPost = {
      id: parseInt(id),
      title: "Getting Started with Drizzle ORM",
      slug: "getting-started-drizzle-orm",
      excerpt: "Learn how to use Drizzle ORM with Next.js",
      content: "# Getting Started\n\nThis is a complete guide...",
      published: true,
      viewCount: 150,
      authorId: 1,
      ...validated,
      updatedAt: new Date(),
      createdAt: new Date("2024-01-01"),
    };

    return NextResponse.json(updatedPost);
  } catch (error) {
    if (error instanceof Error) {
      return NextResponse.json(
        { error: "Validation failed", details: error.message },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: "Failed to update post" },
      { status: 500 }
    );
  }
}

/**
 * Delete post
 * @description Delete a blog post by ID
 * @pathParams PostIdParams
 * @response 204
 * @responseDescription Post deleted successfully
 * @tag Posts
 * @openapi
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Validate
  PostIdParams.parse({ id });

  // Mock deletion
  return new NextResponse(null, { status: 204 });
}
