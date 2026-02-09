import { NextRequest, NextResponse } from "next/server";
import {
  ApiResponse,
  Notification,
  NotificationType,
  ProcessingStatus,
} from "@/types/notification";

/**
 * Get notification status
 * @description Returns success or error response (demonstrates discriminated union types)
 * @response ApiResponse
 * @openapi
 */
export async function GET(request: NextRequest) {
  // Example: Return success response
  const response: ApiResponse = {
    status: "success",
    data: {
      id: "notif-123",
      message: "Notification sent successfully",
    },
  };

  return NextResponse.json(response);
}

/**
 * Send a notification
 * @description Send notification via email, SMS, or push (demonstrates discriminated unions)
 * @body Notification
 * @response 201:ApiResponse:Notification sent successfully
 * @add 400:ApiResponse:Invalid notification data
 * @add 429:ApiResponse:Rate limit exceeded
 * @openapi
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Notification;

    // Type-safe handling based on discriminator
    let result: string;
    switch (body.type) {
      case "email":
        result = `Email sent to ${body.to}`;
        break;
      case "sms":
        result = `SMS sent to ${body.phoneNumber}`;
        break;
      case "push":
        result = `Push notification sent to device ${body.deviceId}`;
        break;
      default:
        // TypeScript exhaustiveness check
        const _exhaustive: never = body;
        throw new Error(`Unhandled notification type`);
    }

    const response: ApiResponse = {
      status: "success",
      data: {
        id: `notif-${Date.now()}`,
        message: result,
      },
    };

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    const errorResponse: ApiResponse = {
      status: "error",
      error: error instanceof Error ? error.message : "Unknown error",
      code: 400,
    };

    return NextResponse.json(errorResponse, { status: 400 });
  }
}
