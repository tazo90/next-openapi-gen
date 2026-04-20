/**
 * String and number catalog
 * @response 200:StringFormatsSchema
 * @tag Catalog
 * @openapi
 */
export async function GET() {
  return Response.json({});
}

/**
 * Numeric refinements catalog
 * @body NumberRefinementsSchema
 * @response 200:ScalarsSchema
 * @tag Catalog
 * @openapi
 */
export async function POST() {
  return Response.json({});
}
