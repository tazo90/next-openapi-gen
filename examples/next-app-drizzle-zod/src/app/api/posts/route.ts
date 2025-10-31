import { NextRequest, NextResponse } from "next/server";
import {
  CreatePostSchema,
  PostResponseSchema,
  PostsQueryParams,
} from "@/schemas/post";

/**
 * Get all posts
 * @description Retrieve a paginated list of blog posts with optional filters
 * @params PostsQueryParams
 * @response PostResponseSchema[]
 * @responseDescription List of blog posts
 * @tag Posts
 * @openapi
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "10");
  const published = searchParams.get("published");
  const authorId = searchParams.get("authorId");

  // Mock data
  const mockPosts = [
    {
      id: 1,
      title: "Getting Started with Drizzle ORM",
      slug: "getting-started-drizzle-orm",
      excerpt: "Learn how to use Drizzle ORM with Next.js",
      content: "Full content here...",
      published: true,
      viewCount: 150,
      authorId: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 2,
      title: "Zod Schema Validation Guide",
      slug: "zod-schema-validation-guide",
      excerpt: "Complete guide to Zod validation",
      content: "Full content here...",
      published: true,
      viewCount: 89,
      authorId: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  return NextResponse.json(mockPosts);
}

/**
 * Create a new post
 * @description Create a new blog post with Drizzle-Zod validation
 * @body CreatePostSchema
 * @bodyDescription Post data including title, content, and author
 * @response 201:PostResponseSchema:Post created successfully
 * @tag Posts
 * @openapi
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate with Drizzle-Zod schema
    const validated = CreatePostSchema.parse(body);

    // Mock created post
    const newPost = {
      id: 3,
      ...validated,
      viewCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    return NextResponse.json(newPost, { status: 201 });
  } catch (error) {
    if (error instanceof Error) {
      return NextResponse.json(
        { error: "Validation failed", details: error.message },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: "Failed to create post" },
      { status: 500 }
    );
  }
}
