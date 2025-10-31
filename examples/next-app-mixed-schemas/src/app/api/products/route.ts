import { NextRequest, NextResponse } from "next/server";

/**
 * Get products
 * @description Get paginated list of products (uses Zod schema)
 * @params PaginationParams
 * @response PaginatedResponse<ProductSchema>
 * @tag Products
 * @openapi
 */
export async function GET(request: NextRequest) {
  return NextResponse.json({
    data: [
      {
        id: "prod-123",
        name: "Sample Product",
        description: "A great product",
        price: 29.99,
        inStock: true,
        tags: ["new", "featured"],
      },
    ],
    total: 1,
    page: 1,
    limit: 10,
    totalPages: 1,
  });
}

/**
 * Create product
 * @description Create a new product (uses Zod schema)
 * @body CreateProductSchema
 * @response 201:ProductSchema
 * @tag Products
 * @openapi
 */
export async function POST(request: NextRequest) {
  const body = await request.json();

  return NextResponse.json(
    {
      id: "prod-new",
      ...body,
    },
    { status: 201 }
  );
}
