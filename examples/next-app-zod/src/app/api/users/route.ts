import { NextRequest, NextResponse } from "next/server";

/**
 * Get users
 * @description Retrieve users
 * @params UserListParamsSchema
 * @response UserDetailedSchema
 * @responseDescription Response users list
 * @responseSet common,auth
 * @openapi
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  // Implementation here...

  return NextResponse.json({});
}
