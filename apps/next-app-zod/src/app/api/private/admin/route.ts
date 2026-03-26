import { z } from "zod";
import { NextResponse } from "next/server";

/**
 * Internal admin schema – should NEVER appear in the public OpenAPI spec.
 *
 * To keep this route (and its schema) out of the generated spec, restrict
 * apiDir in next.openapi.json to the public subdirectory, e.g.:
 *
 *   "apiDir": "./src/app/api/public"
 *
 * With apiDir set that way, findRouteFiles() only scans the public subtree,
 * so AdminStatsSchema is never registered in the output.
 */
const AdminStatsSchema = z.object({
  totalUsers: z.number().int(),
  revenue: z.number(),
  secretKey: z.string(),
});

/**
 * Admin stats – private, not documented in the public API
 * @openapi
 * @response AdminStatsSchema
 */
export async function GET() {
  return NextResponse.json({ totalUsers: 0, revenue: 0, secretKey: "redacted" });
}
