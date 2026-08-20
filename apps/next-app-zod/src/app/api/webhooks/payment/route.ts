import { createHmac, timingSafeEqual } from "node:crypto";

import { AuthErrorResponse } from "@/schemas/session";
import { PaymentEvent } from "@/schemas/webhook";
import { NextResponse } from "next/server";

function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  webhookSecret: string,
): boolean {
  if (!signatureHeader) {
    return false;
  }

  const expected = createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
  const provided = Buffer.from(signatureHeader);
  const computed = Buffer.from(expected);

  return provided.length === computed.length && timingSafeEqual(provided, computed);
}

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
  const webhookSecret = process.env.PAYMENT_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json(
      AuthErrorResponse.parse({
        code: "unknown",
        message: "Webhook secret is not configured",
      }),
      { status: 500 },
    );
  }

  const signature = request.headers.get("x-webhook-signature");
  const rawBody = await request.text();

  if (!verifyWebhookSignature(rawBody, signature, webhookSecret)) {
    return NextResponse.json(
      AuthErrorResponse.parse({
        code: "invalid_credentials",
        message: "Invalid webhook signature",
      }),
      { status: 401 },
    );
  }

  const payload: unknown = JSON.parse(rawBody);
  PaymentEvent.parse(payload);
  return new NextResponse(null, { status: 204 });
}
