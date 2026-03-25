import { NextRequest, NextResponse } from "next/server";
import { getProductSummary } from "../../route.utils";

/**
 * Get Product Summary
 *
 * @description Demonstrates simple Awaited<ReturnType<>> pattern
 *
 * Returns only name and price of the product.
 * Type is automatically inferred from getProductSummary function.
 *
 * @pathParams ProductIdParam
 * @response ProductSummaryResponse
 * @openapi
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const summary = await getProductSummary(id);

    return NextResponse.json({
      success: true,
      data: summary,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: "Failed to get product summary",
      },
      { status: 500 }
    );
  }
}
