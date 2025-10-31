import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const DashboardResponse = z.object({
  id: z.string().describe("Dashboard ID"),
  name: z.string().describe("Dashboard name"),
  widgets: z.array(z.string()).describe("Widget IDs"),
  userId: z.string().describe("Owner user ID"),
});

/**
 * Get user dashboard
 * @description Retrieves the user's dashboard configuration
 * @response DashboardResponse
 * @auth bearer
 * @tag Dashboard
 * @openapi
 */
export async function GET(request: NextRequest) {
  return NextResponse.json({
    id: "dashboard-123",
    name: "My Dashboard",
    widgets: ["widget-1", "widget-2"],
    userId: "user-456",
  });
}

/**
 * Update dashboard
 * @description Updates the user's dashboard configuration
 * @body DashboardResponse
 * @response DashboardResponse
 * @auth bearer
 * @tag Dashboard
 * @openapi
 */
export async function PUT(request: NextRequest) {
  const body = await request.json();
  return NextResponse.json(body);
}