import { NextRequest, NextResponse } from "next/server";

/**
 * Get orders
 * @description Get paginated list of orders (uses TypeScript types)
 * @params PaginationParams
 * @response PaginatedResponse<Order>
 * @tag Orders
 * @openapi
 */
export async function GET(request: NextRequest) {
  return NextResponse.json({
    data: [
      {
        id: "order-123",
        userId: "user-456",
        items: [
          {
            productId: "prod-789",
            quantity: 2,
            pricePerUnit: 29.99,
          },
        ],
        status: "processing",
        totalAmount: 59.98,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
    total: 1,
    page: 1,
    limit: 10,
    totalPages: 1,
  });
}

/**
 * Create order
 * @description Create a new order (uses TypeScript types)
 * @body CreateOrderRequest
 * @response 201:Order:Order created successfully
 * @tag Orders
 * @openapi
 */
export async function POST(request: NextRequest) {
  const body = await request.json();

  return NextResponse.json(
    {
      id: "order-new",
      userId: "user-current",
      items: body.items,
      status: "pending",
      totalAmount: body.items.reduce(
        (sum: number, item: any) => sum + item.quantity * item.pricePerUnit,
        0
      ),
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    { status: 201 }
  );
}
