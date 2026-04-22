import { NextResponse } from "next/server";

import { PaymentEvent } from "@/schemas/webhook";

/**
 * Receive payment events
 * @summary Payment webhook
 * @description
 * Endpoint invoked by the platform when a payment changes state. The request body is a
 * discriminated union keyed on `type`; callers that cannot inspect the tag should fall back
 * to `payment.succeeded` per `@discriminator defaultMapping`.
 * @tag Webhooks
 * @tags Billing, Platform
 * @webhook paymentEvent
 * @body PaymentEvent
 * @bodyDescription Signed payment event payload
 * @response 204
 * @responseDescription Delivery accepted; platform treats 2xx as "delivered"
 * @response 4XX:AuthErrorResponse:Signature or replay check failed
 * @responseHeader 204 X-Idempotency-Key string Echoed idempotency key
 * @security BearerAuth
 * @operationId zodReceivePaymentEvent
 * @openapi
 */
export async function POST(request: Request) {
  PaymentEvent.parse(await request.json());
  return new NextResponse(null, { status: 204 });
}
