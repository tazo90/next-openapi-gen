import { NextRequest, NextResponse } from "next/server";
import {
  ApiResponseSchema,
  NotificationSchema,
} from "@/schemas/notification";
import { z } from "zod";

/**
 * Get notification status
 * @description Returns success or error response (demonstrates Zod discriminated union)
 * @response ApiResponseSchema
 * @openapi
 */
export async function GET(request: NextRequest) {
  // Example: Return success response
  const response = {
    status: "success",
    data: {
      id: "notif-123",
      message: "Notification retrieved successfully",
    },
  };

  // Validate response against schema (optional but recommended)
  const validatedResponse = ApiResponseSchema.parse(response);

  return NextResponse.json(validatedResponse);
}

/**
 * Send a notification
 * @description Send notification via email, SMS, or push (demonstrates Zod discriminated unions with validation)
 * @body NotificationSchema
 * @response 201:ApiResponseSchema:Notification sent successfully
 * @add 400:ApiResponseSchema:Invalid notification data or validation failed
 * @add 429:ApiResponseSchema:Rate limit exceeded
 * @openapi
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate and parse the request body using Zod
    const notification = NotificationSchema.parse(body);

    // Type-safe handling based on discriminator
    // TypeScript knows the exact type in each case branch
    let result: string;
    switch (notification.type) {
      case "email":
        result = `Email sent to ${notification.to} with subject: ${notification.subject}`;
        break;
      case "sms":
        result = `SMS sent to ${notification.phoneNumber}: ${notification.message}`;
        break;
      case "push":
        result = `Push notification sent to device ${notification.deviceId}: ${notification.title}`;
        break;
      default:
        // TypeScript exhaustiveness check ensures all cases are handled
        const _exhaustive: never = notification;
        throw new Error(`Unhandled notification type`);
    }

    const response = {
      status: "success" as const,
      data: {
        id: `notif-${Date.now()}`,
        message: result,
      },
    };

    // Validate response
    const validatedResponse = ApiResponseSchema.parse(response);

    return NextResponse.json(validatedResponse, { status: 201 });
  } catch (error) {
    // Handle Zod validation errors
    if (error instanceof z.ZodError) {
      const errorResponse = {
        status: "error" as const,
        error: `Validation failed: ${error.errors.map((e) => e.message).join(", ")}`,
        code: 400,
      };

      return NextResponse.json(errorResponse, { status: 400 });
    }

    // Handle other errors
    const errorResponse = {
      status: "error" as const,
      error: error instanceof Error ? error.message : "Unknown error",
      code: 500,
    };

    return NextResponse.json(errorResponse, { status: 500 });
  }
}
