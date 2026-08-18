/**
 * Legacy basic-auth endpoint
 * @auth basic
 * @openapi
 */
export async function GET() {
  return Response.json({ ok: true });
}
