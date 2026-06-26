import { NextRequest, NextResponse } from "next/server";

import { createProduct } from "./route.utils";

/**
 * Create New Product
 *
 * @description Demonstrates ReturnType and Parameters utility types
 *
 * Request body type is inferred from createProduct function parameters.
 * Response type is inferred from createProduct return type.
 *
 * @summary Create product
 * @tag Products
 * @tags Commerce
 * @body CreateProductRequest
 * @response CreateProductApiResponse
 * @response 4XX:ErrorResponse:Any client error
 * @response 5XX:ErrorResponse:Any server error
 * @response default:ErrorResponse:Fallback error envelope
 * @responseHeader 200 X-Request-Id string Trace identifier
 * @openapi
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const result = createProduct(body.product, body.options || { notify: false });

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
      { status: 400 },
    );
  }
}
