import { z } from "zod";

export const organizationParamsSchema = z.object({
  organizationId: z.string().uuid(),
});

/**
 * Get organization
 * @response CurrentUserResponse
 * @openapi
 */
export async function GET(_request: Request, context: { params: Promise<{ organizationId: string }> }) {
  organizationParamsSchema.parse(await context.params);
  return Response.json({ id: "00000000-0000-0000-0000-000000000001" });
}
