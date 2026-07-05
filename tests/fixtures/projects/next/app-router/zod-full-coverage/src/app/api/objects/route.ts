/**
 * Object modes catalog
 * @body ExtendedObject
 * @response 200:MergedObject
 * @response 201:StrictObject
 * @response 202:PassthroughObject
 * @response 203:CatchAllObject
 * @tag Objects
 * @openapi
 */
export async function POST() {
  return Response.json({});
}

/**
 * Picked / omitted objects
 * @response 200:PickedObject
 * @response 206:OmittedObject
 * @response 207:PartialObject
 * @tag Objects
 * @openapi
 */
export async function GET() {
  return Response.json({});
}
