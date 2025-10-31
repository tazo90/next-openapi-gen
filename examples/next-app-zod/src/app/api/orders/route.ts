import { NextRequest, NextResponse } from "next/server";

/**
 * Get orders list
 * @description Retrieves a paginated list of orders with filtering and sorting options
 * @params OrdersQueryParams
 * @response OrdersResponse
 * @auth bearer
 * @openapi
 */
export async function GET(request: NextRequest) {
  // Implementation here

  return NextResponse.json({});
}

/**
 * Create order
 * @description Creates a new order from cart
 * @body CreateOrderBody
 * @response OrderSchema
 * @auth bearer
 * @openapi
 */
export async function POST(request: NextRequest) {
  // Impelementation here...

  return NextResponse.json({});
}
