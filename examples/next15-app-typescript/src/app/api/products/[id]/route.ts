import { NextRequest, NextResponse } from "next/server";
import { getProductById, updateStock } from "../route.utils";

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
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const result = await getProductById(id);

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
 * Update Product Stock
 *
 * @description Demonstrates Awaited<ReturnType<typeof func>> with async functions
 *
 * Updates the stock status of a product.
 * Response type is automatically inferred from updateStock function and wrapped in ApiResponse.
 *
 * @pathParams ProductIdParam
 * @body UpdateStockRequest
 * @response UpdateStockApiResponse
 * @openapi
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const body = await request.json();
    const { id } = await params;
    const result = await updateStock(id, body.inStock);

    return NextResponse.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: "Failed to update stock",
      },
      { status: 400 }
    );
  }
}
