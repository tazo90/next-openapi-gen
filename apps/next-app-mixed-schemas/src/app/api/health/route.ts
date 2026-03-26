import { NextRequest, NextResponse } from "next/server";

/**
 * Health check
 * @description Check service health (schema from separate types directory)
 * @response HealthCheckResponse
 * @tag System
 * @openapi
 */
export async function GET(request: NextRequest) {
  return NextResponse.json({
    status: "healthy",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
}
