/**
 * Returns a user while intentionally omitting a path parameter schema.
 * @response 200
 * @openapi
 */
export async function GET() {
  return Response.json({ id: "fixture-user" });
}
