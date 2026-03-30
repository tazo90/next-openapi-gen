import { NextResponse } from "next/server";

import type { OrderRecord, OrderRecordIdParams, UpdateOrderRecordInput } from "@/schemas/order";

type OrderRouteContext = {
  params: Promise<OrderRecordIdParams>;
};

/**
 * Get order by ID.
 * @description Demonstrates default typed-config discovery through next-openapi.config.ts.
 * @pathParams OrderRecordIdParams
 * @response OrderRecord
 * @tag Orders
 * @openapi
 */
export async function GET(_request: Request, { params }: OrderRouteContext) {
  const { id } = await params;

  return NextResponse.json({
    id,
    totalCents: 4200,
    status: "paid",
  } satisfies OrderRecord);
}

/**
 * Update order by ID.
 * @description Demonstrates typed request and response contracts with next-openapi.config.ts.
 * @pathParams OrderRecordIdParams
 * @body UpdateOrderRecordInput
 * @response OrderRecord
 * @tag Orders
 * @openapi
 */
export async function PATCH(request: Request, { params }: OrderRouteContext) {
  const { id } = await params;
  const body = (await request.json()) as UpdateOrderRecordInput;

  return NextResponse.json({
    id,
    totalCents: body.totalCents ?? 4200,
    status: body.status ?? "paid",
  } satisfies OrderRecord);
}
