/**
 * Public health check
 * @openapi
 */
export async function GET() {
  return Response.json({ ok: true });
}
