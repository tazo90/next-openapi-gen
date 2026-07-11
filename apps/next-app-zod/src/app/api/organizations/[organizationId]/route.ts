import { NextResponse } from "next/server";
import { z } from "zod";

export const organizationParamsSchema = z.object({
  organizationId: z.string().uuid(),
});

type RouteContext = {
  params: Promise<{ organizationId: string }>;
};

/**
 * Get organization
 * @summary Get organization
 * @tag Organizations
 * @response UserDetailedSchema
 * @openapi
 */
export async function GET(_request: Request, context: RouteContext) {
  organizationParamsSchema.parse(await context.params);
  return NextResponse.json({ id: "00000000-0000-0000-0000-000000000001" });
}
