import { NextRequest, NextResponse } from "next/server";

/**
 * Get API metadata
 * @description Get API version and environment info (uses custom YAML schema)
 * @response ApiMetadata
 * @tag System
 * @openapi
 */
export async function GET(request: NextRequest) {
  return NextResponse.json({
    version: "1.0.0",
    environment: "development",
    region: "us-east-1",
  });
}
