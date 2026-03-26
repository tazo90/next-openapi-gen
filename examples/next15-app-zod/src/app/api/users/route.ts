import { NextRequest, NextResponse } from "next/server";

type RouteContext = {
  params: Promise<{ id: string }>;
};

/**
 * Get users
 * @description Retrieve users
 * @params UserListParamsSchema
 * @response UserDetailedSchema
 * @responseDescription Response users list
 * @responseSet common,auth
 * @openapi
 */
export async function GET(request: NextRequest, { params }: RouteContext) {
  await params;
  // Implementation here...

  return NextResponse.json({});
}
