import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const UserSettings = z.object({
  theme: z.enum(["light", "dark"]).describe("UI theme preference"),
  notifications: z.boolean().describe("Enable notifications"),
  language: z.string().describe("Preferred language"),
  timezone: z.string().describe("User timezone"),
});

/**
 * Get user settings
 * @description Retrieves the user's personal settings
 * @response UserSettings
 * @auth bearer
 * @tag Settings
 * @openapi
 */
export async function GET(request: NextRequest) {
  return NextResponse.json({
    theme: "dark",
    notifications: true,
    language: "en",
    timezone: "UTC",
  });
}

/**
 * Update user settings
 * @description Updates the user's personal settings
 * @body UserSettings
 * @response UserSettings
 * @auth bearer
 * @tag Settings
 * @openapi
 */
export async function PATCH(request: NextRequest) {
  const body = await request.json();
  return NextResponse.json(body);
}