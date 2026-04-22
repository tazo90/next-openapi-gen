import { NextRequest, NextResponse } from "next/server";

import type { ImmutableInvoice, InvoiceIdParams } from "@/types/billing";

type RouteContext = {
  params: Promise<{ id: string }>;
};

/**
 * Get invoice
 * @summary Get invoice
 * @description Fetches a single invoice by identifier. Response properties are all `readonly` to emit `readOnly: true`.
 * @tag Billing
 * @tags Finance
 * @pathParams InvoiceIdParams
 * @response ImmutableInvoice
 * @response 4XX:ErrorResponse:Any client error
 * @responseHeader 200 ETag string Strong ETag for optimistic concurrency
 * @auth bearer
 * @operationId tsGetInvoice
 * @openapi
 */
export async function GET(_request: NextRequest, { params }: RouteContext) {
  await params;
  return NextResponse.json({});
}
