import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { OrderStatusSchema } from "@/schemas/order";

// Path parameters schema
export const OrderIdParams = z.object({
  id: z.string().uuid().describe("Order ID"),
});

// Update order status request body
export const UpdateOrderStatusBody = z.object({
  status: OrderStatusSchema.describe("New order status"),
  notes: z
    .string()
    .optional()
    .describe("Additional notes about the status change"),
});

/**
 * Get order by ID
 * @desc Retrieves detailed order information
 * @pathParams OrderIdParams
 * @response OrderSchema
 * @auth bearer
 * @openapi
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  // Validate path parameters
  const pathResult = OrderIdParams.safeParse({ id: params.id });

  if (!pathResult.success) {
    return NextResponse.json(
      { error: "Invalid order ID", details: pathResult.error.format() },
      { status: 400 }
    );
  }

  // Check if order exists (mock checking)
  if (
    params.id !== "f47ac10b-58cc-4372-a567-0e02b2c3d479" &&
    params.id !== "a12bc34d-5e6f-7g8h-9i0j-klmno123456"
  ) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  // Mock order data
  const mockOrder = {
    id: params.id,
    userId: "123e4567-e89b-12d3-a456-426614174000",
    items: [
      {
        productId: "7f9c4e6d-8f0a-4f1c-b543-1a2b3c4d5e6f",
        quantity: 2,
        price: 99.99,
        name: "Wireless Headphones",
        options: { color: "black" },
      },
    ],
    shippingAddress: {
      street: "Main Street",
      houseNumber: "42A",
      city: "New York",
      postalCode: "10001",
      country: "USA",
    },
    billingAddress: {
      street: "Main Street",
      houseNumber: "42A",
      city: "New York",
      postalCode: "10001",
      country: "USA",
    },
    paymentMethod: {
      type: "card",
      cardNumber: "4242 4242 4242 4242",
      expiryDate: "12/25",
      cardholderName: "John Doe",
    },
    status: "delivered",
    subtotal: 199.98,
    discountAmount: 0,
    shippingCost: 10,
    tax: 20,
    total: 229.98,
    createdAt: new Date("2023-06-15T12:00:00Z"),
    updatedAt: new Date("2023-06-15T15:30:00Z"),
    paymentDate: new Date("2023-06-15T12:15:00Z"),
    shippingDate: new Date("2023-06-16T09:00:00Z"),
    deliveryDate: new Date("2023-06-18T14:00:00Z"),
  };

  return NextResponse.json(mockOrder);
}

/**
 * Update order status
 * @desc Updates the status of an order
 * @pathParams OrderIdParams
 * @body UpdateOrderStatusBody
 * @response OrderSchema
 * @auth bearer
 * @openapi
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  // Validate path parameters
  const pathResult = OrderIdParams.safeParse({ id: params.id });

  if (!pathResult.success) {
    return NextResponse.json(
      { error: "Invalid order ID", details: pathResult.error.format() },
      { status: 400 }
    );
  }

  try {
    // Parse and validate request body
    const body = await request.json();
    const bodyResult = UpdateOrderStatusBody.safeParse(body);

    if (!bodyResult.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: bodyResult.error.format() },
        { status: 400 }
      );
    }

    // Check if order exists (mock checking)
    if (
      params.id !== "f47ac10b-58cc-4372-a567-0e02b2c3d479" &&
      params.id !== "a12bc34d-5e6f-7g8h-9i0j-klmno123456"
    ) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // Mock existing order
    const existingOrder = {
      id: params.id,
      userId: "123e4567-e89b-12d3-a456-426614174000",
      items: [
        {
          productId: "7f9c4e6d-8f0a-4f1c-b543-1a2b3c4d5e6f",
          quantity: 2,
          price: 99.99,
          name: "Wireless Headphones",
          options: { color: "black" },
        },
      ],
      shippingAddress: {
        street: "Main Street",
        houseNumber: "42A",
        city: "New York",
        postalCode: "10001",
        country: "USA",
      },
      billingAddress: {
        street: "Main Street",
        houseNumber: "42A",
        city: "New York",
        postalCode: "10001",
        country: "USA",
      },
      paymentMethod: {
        type: "card",
        cardNumber: "4242 4242 4242 4242",
        expiryDate: "12/25",
        cardholderName: "John Doe",
      },
      status: "shipped", // Current status
      subtotal: 199.98,
      discountAmount: 0,
      shippingCost: 10,
      tax: 20,
      total: 229.98,
      notes: "",
      createdAt: new Date("2023-06-15T12:00:00Z"),
      updatedAt: new Date("2023-06-15T15:30:00Z"),
      paymentDate: new Date("2023-06-15T12:15:00Z"),
      shippingDate: new Date("2023-06-16T09:00:00Z"),
      deliveryDate: null, // Not delivered yet
    };

    // Update status and related fields
    const updatedOrder = {
      ...existingOrder,
      status: bodyResult.data.status,
      notes: bodyResult.data.notes || existingOrder.notes,
      updatedAt: new Date(),
    };

    // Update specific date fields based on the new status
    if (bodyResult.data.status === "paid" && !updatedOrder.paymentDate) {
      updatedOrder.paymentDate = new Date();
    }

    if (bodyResult.data.status === "shipped" && !updatedOrder.shippingDate) {
      updatedOrder.shippingDate = new Date();
    }

    if (bodyResult.data.status === "delivered" && !updatedOrder.deliveryDate) {
      updatedOrder.deliveryDate = new Date();
    }

    // Return the updated order
    return NextResponse.json(updatedOrder);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to update order status" },
      { status: 500 }
    );
  }
}

/**
 * Cancel order
 * @desc Cancels an order if it's not already delivered
 * @pathParams OrderIdParams
 * @auth bearer
 * @openapi
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  // Validate path parameters
  const pathResult = OrderIdParams.safeParse({ id: params.id });

  if (!pathResult.success) {
    return NextResponse.json(
      { error: "Invalid order ID", details: pathResult.error.format() },
      { status: 400 }
    );
  }

  // Check if order exists (mock checking)
  if (
    params.id !== "f47ac10b-58cc-4372-a567-0e02b2c3d479" &&
    params.id !== "a12bc34d-5e6f-7g8h-9i0j-klmno123456"
  ) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  // Mock check if order can be cancelled
  // For this example, order f47ac10b-58cc-4372-a567-0e02b2c3d479 is delivered and cannot be cancelled
  if (params.id === "f47ac10b-58cc-4372-a567-0e02b2c3d479") {
    return NextResponse.json(
      {
        error:
          "Order cannot be cancelled because it has already been delivered",
      },
      { status: 400 }
    );
  }

  // Return a success response for cancellable orders
  return NextResponse.json({
    success: true,
    message: "Order successfully cancelled",
    id: params.id,
    status: "cancelled",
    updatedAt: new Date(),
  });
}
