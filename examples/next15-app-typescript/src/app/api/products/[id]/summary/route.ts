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
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const summary = await getProductSummary(params.id);

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
