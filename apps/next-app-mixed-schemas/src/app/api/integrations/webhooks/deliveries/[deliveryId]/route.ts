import { NextRequest, NextResponse } from "next/server";

import { z } from "zod";

const DeliveryIdParams = z.object({
  deliveryId: z.string().describe("Delivery attempt identifier"),
});

const DeliveryResponse = z.object({
  id: z.string().describe("Delivery identifier"),
  status: z.enum(["delivered", "failed", "pending"]),
  attemptedAt: z.string().datetime(),
  responseCode: z.number().int(),
});

type RouteContext = {
  params: Promise<{ deliveryId: string }>;
};

/**
 * Fetch webhook delivery
 * @summary Get delivery attempt
 * @description Returns a single webhook delivery attempt — target for the `@link` from the register endpoint.
 * @tag Integrations
 * @tags Webhooks
 * @pathParams DeliveryIdParams
 * @response DeliveryResponse
 * @responseHeader 200 X-Request-Id string Trace identifier
 * @auth bearer
 * @operationId mixedGetWebhookDelivery
 * @openapi
 */
export async function GET(_request: NextRequest, { params }: RouteContext) {
  const { deliveryId } = await params;
  return NextResponse.json({ id: deliveryId });
}
