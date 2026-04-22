import { NextResponse } from "next/server";

/**
 * Receive integration events
 * @summary Integration event webhook
 * @description Endpoint invoked by partner integrations when external resources change. Emitted under the root `webhooks` section.
 * @webhook integrationEvent
 * @tag Integrations
 * @tags Webhooks
 * @body WebhookEnvelope
 * @response 204
 * @responseDescription Delivery accepted
 * @responseHeader 204 X-Idempotency-Key string Echoed idempotency key
 * @operationId mixedReceiveIntegrationEvent
 * @openapi
 */
export async function POST() {
  return new NextResponse(null, { status: 204 });
}
