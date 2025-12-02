import { NextRequest, NextResponse } from "next/server";

/**
 * Get nested schema example
 * @description Retrieve nested schema data to test $ref generation
 * @response NestedSchema
 * @responseDescription Returns nested schema with base schema reference
 * @openapi
 */
export async function GET(request: NextRequest) {
  return NextResponse.json({
    foo: {
      id: "550e8400-e29b-41d4-a716-446655440000",
    },
    bar: "example string",
  });
}

/**
 * Create extended schema
 * @description Create a new item with extended schema to test .extend() functionality
 * @body ExtendedSchema
 * @bodyDescription Extended schema with base and additional properties
 * @response ExtendedSchema
 * @responseDescription Returns the created extended schema
 * @openapi
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  return NextResponse.json(body);
}

/**
 * Update double extended schema
 * @description Update with double extended schema to test deep inheritance
 * @body DoubleExtendedSchema
 * @bodyDescription Double extended schema with multiple levels of inheritance
 * @response DoubleExtendedSchema
 * @responseDescription Returns the updated double extended schema
 * @openapi
 */
export async function PUT(request: NextRequest) {
  const body = await request.json();
  return NextResponse.json(body);
}
