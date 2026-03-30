import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const AdminAuditQuery = z.object({
  actorId: z.string().optional().describe("Filter by actor"),
  limit: z.number().int().positive().optional().describe("Maximum audit rows"),
});

const AdminAuditEntry = z.object({
  action: z.string().describe("Administrative action"),
  actorId: z.string().describe("Administrator identifier"),
  occurredAt: z.string().datetime().describe("Timestamp"),
  resourceId: z.string().optional().describe("Optional related resource"),
});

/**
 * List admin audit entries
 * @description Provides a second admin route-group example with explicit auth and edge-case query parsing.
 * @queryParams AdminAuditQuery
 * @response AdminAuditEntry[]
 * @auth bearer
 * @tag Admin
 * @responseSet auth
 * @openapi
 */
export async function GET(_request: NextRequest) {
  return NextResponse.json([
    {
      action: "feature_flag.updated",
      actorId: "admin_1",
      occurredAt: "2026-03-29T12:15:00.000Z",
      resourceId: "flag_beta_checkout",
    },
  ]);
}
