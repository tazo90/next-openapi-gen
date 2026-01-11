import { NextRequest, NextResponse } from "next/server";
import { getProductById, getProductSummary, createProduct } from "./route.utils";

/**
 * Get Product by ID
 *
 * @description Demonstrates Awaited<ReturnType<typeof func>> utility type support
 *
 * This endpoint showcases the main bug fix from issue #53.
 * The response type is automatically inferred from the getProductById function.
 *
 * @pathParams ProductIdParam
 * @response ProductByIdResponse
 * @openapi
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const result = await getProductById(params.id);

    return NextResponse.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: "Product not found",
      },
      { status: 404 }
    );
  }
}

/**
 * Create New Product
 *
 * @description Demonstrates ReturnType and Parameters utility types
 *
 * Request body type is inferred from createProduct function parameters.
 * Response type is inferred from createProduct return type.
 *
 * @body CreateProductRequest
 * @response CreateProductApiResponse
 * @openapi
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const result = createProduct(
      body.product,
      body.options || { notify: false }
    );

    return NextResponse.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: "Failed to create product",
      },
      { status: 400 }
    );
  }
}
