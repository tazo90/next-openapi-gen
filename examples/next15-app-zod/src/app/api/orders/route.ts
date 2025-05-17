import { NextRequest, NextResponse } from "next/server";
import {
  OrdersQueryParams,
  OrderSchema,
  CreateOrderBody,
} from "@/schemas/order";

/**
 * Get orders list
 * @desc Retrieves a paginated list of orders with filtering and sorting options
 * @params OrdersQueryParams
 * @response OrdersResponse
 * @auth bearer
 * @openapi
 */
export async function GET(request: NextRequest) {
  // Parse and validate query parameters
  const { searchParams } = new URL(request.url);

  // Extract query parameters
  const queryParams = {
    page: searchParams.get("page")
      ? Number(searchParams.get("page"))
      : undefined,
    limit: searchParams.get("limit")
      ? Number(searchParams.get("limit"))
      : undefined,
    status: searchParams.get("status") || undefined,
    dateFrom: searchParams.get("dateFrom")
      ? new Date(searchParams.get("dateFrom")!)
      : undefined,
    dateTo: searchParams.get("dateTo")
      ? new Date(searchParams.get("dateTo")!)
      : undefined,
    sort: searchParams.get("sort") || undefined,
  };

  // Validate query parameters
  const queryResult = OrdersQueryParams.safeParse(queryParams);

  if (!queryResult.success) {
    return NextResponse.json(
      {
        error: "Invalid query parameters",
        details: queryResult.error.format(),
      },
      { status: 400 }
    );
  }

  const { page, limit, status, dateFrom, dateTo, sort } = queryResult.data;

  const mockOrders = [
    {
      id: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
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
    },
    {
      id: "a12bc34d-5e6f-7g8h-9i0j-klmno123456",
      userId: "123e4567-e89b-12d3-a456-426614174000",
      items: [
        {
          productId: "abc12345-67de-89f0-1a2b-34c56d7e8f90",
          quantity: 1,
          price: 899.99,
          name: "Smartphone",
          options: { color: "silver", storage: "128GB" },
        },
        {
          productId: "1a2b3c4d-5e6f-7g8h-9i0j-klmnopqrstu",
          quantity: 1,
          price: 29.99,
          name: "Phone Case",
          options: { color: "clear" },
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
        type: "paypal",
        email: "john.doe@example.com",
      },
      status: "shipped",
      subtotal: 929.98,
      discountAmount: 30,
      shippingCost: 0,
      tax: 90,
      total: 989.98,
      notes: "Please leave at the front door",
      createdAt: new Date("2023-07-20T10:00:00Z"),
      updatedAt: new Date("2023-07-20T10:15:00Z"),
      paymentDate: new Date("2023-07-20T10:05:00Z"),
      shippingDate: new Date("2023-07-21T09:00:00Z"),
      deliveryDate: null,
    },
  ];

  // Filter orders based on query parameters
  let filteredOrders = [...mockOrders];

  if (status) {
    filteredOrders = filteredOrders.filter((order) => order.status === status);
  }

  if (dateFrom) {
    filteredOrders = filteredOrders.filter(
      (order) => order.createdAt >= dateFrom
    );
  }

  if (dateTo) {
    filteredOrders = filteredOrders.filter(
      (order) => order.createdAt <= dateTo
    );
  }

  // Sort orders
  if (sort) {
    switch (sort) {
      case "date_asc":
        filteredOrders.sort(
          (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
        );
        break;
      case "date_desc":
        filteredOrders.sort(
          (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
        );
        break;
      case "total_asc":
        filteredOrders.sort((a, b) => a.total - b.total);
        break;
      case "total_desc":
        filteredOrders.sort((a, b) => b.total - a.total);
        break;
    }
  }

  // Calculate pagination
  const totalOrders = filteredOrders.length;
  const totalPages = Math.ceil(totalOrders / limit);
  const startIndex = (page - 1) * limit;
  const endIndex = startIndex + limit;

  // Get paginated orders
  const paginatedOrders = filteredOrders.slice(startIndex, endIndex);

  // Create response
  const response = {
    orders: paginatedOrders,
    pagination: {
      total: totalOrders,
      pages: totalPages,
      page,
      limit,
    },
  };

  return NextResponse.json(response);
}

/**
 * Create order
 * @desc Creates a new order from cart
 * @body CreateOrderBody
 * @response OrderSchema
 * @auth bearer
 * @openapi
 */
export async function POST(request: NextRequest) {
  try {
    // Parse and validate request body
    const body = await request.json();
    const bodyResult = CreateOrderBody.safeParse(body);

    if (!bodyResult.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: bodyResult.error.format() },
        { status: 400 }
      );
    }

    const data = bodyResult.data;

    // Determine shipping address (from ID or provided new address)
    const shippingAddress = data.shippingAddress || {
      street: "Main Street",
      houseNumber: "42A",
      city: "New York",
      postalCode: "10001",
      country: "USA",
    };

    // Determine billing address
    let billingAddress = data.billingAddress;

    if (data.useShippingAsBilling) {
      billingAddress = shippingAddress;
    } else if (!billingAddress) {
      billingAddress = {
        street: "Main Street",
        houseNumber: "42A",
        city: "New York",
        postalCode: "10001",
        country: "USA",
      };
    }

    // Determine payment method
    const paymentMethod = data.paymentMethod || {
      type: "card",
      cardNumber: "4242 4242 4242 4242",
      expiryDate: "12/25",
      cardholderName: "John Doe",
    };

    // Mock cart items for the example
    const cartItems = [
      {
        productId: "7f9c4e6d-8f0a-4f1c-b543-1a2b3c4d5e6f",
        quantity: 2,
        price: 99.99,
        name: "Wireless Headphones",
        options: { color: "black" },
      },
    ];

    // Calculate totals
    const subtotal = cartItems.reduce(
      (total, item) => total + item.price * item.quantity,
      0
    );
    const discountAmount = 0;
    const shippingCost = 10;
    const taxRate = 0.1; // 10%
    const tax = Math.round((subtotal - discountAmount) * taxRate * 100) / 100;
    const total = subtotal - discountAmount + shippingCost + tax;

    // Create new order
    const newOrder = {
      id: crypto.randomUUID(),
      userId: "123e4567-e89b-12d3-a456-426614174000",
      items: cartItems,
      shippingAddress,
      billingAddress,
      paymentMethod,
      status: "pending",
      subtotal,
      discountAmount,
      shippingCost,
      tax,
      total,
      notes: data.notes,
      createdAt: new Date(),
      updatedAt: new Date(),
      paymentDate: null,
      shippingDate: null,
      deliveryDate: null,
    };

    // Validate the created order against the OrderSchema
    const orderResult = OrderSchema.safeParse(newOrder);

    if (!orderResult.success) {
      console.error("Error validating created order:", orderResult.error);
      return NextResponse.json(
        { error: "Error creating order", details: orderResult.error.format() },
        { status: 500 }
      );
    }

    // Return the created order
    return NextResponse.json(newOrder, { status: 201 });
  } catch (error) {
    console.error("Error creating order:", error);
    return NextResponse.json(
      { error: "Failed to create order" },
      { status: 500 }
    );
  }
}
