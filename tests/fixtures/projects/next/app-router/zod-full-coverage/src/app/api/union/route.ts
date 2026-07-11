/**
 * Discriminated unions and enums
 * @response 200:Pet
 * @response 201:ColorEnum
 * @response 202:StringOrNumber
 * @response 203:NullableScalar
 * @response 210:NullishScalar
 * @response 211:OptionalScalar
 * @response 212:WithDefault
 * @response 213:ReadonlyField
 * @response 214:Branded
 * @response 215:Described
 * @tag Unions
 * @openapi
 */
export async function GET() {
  return Response.json({});
}
