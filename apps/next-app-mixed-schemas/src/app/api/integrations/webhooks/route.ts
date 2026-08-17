import { createHmac, timingSafeEqual } from "node:crypto";

import {
  CreateWebhookEndpointSchema,
  WebhookEndpointSchema,
  webhookRegistrationExamples,
} from "@/schemas/zod-schemas";
import type { NextRequest } from "next/server";
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
 * List registered webhooks
 * @description Combines route-generated schemas with preserved 3.2 fragments such as pathItems, callbacks, links, and rich examples.
 * @response PaginatedResponse<WebhookAttempt>
 * @tag Integrations
 * @tagSummary Outbound integrations
 * @tagKind integration
 * @tagParent Platform
 * @openapi
 */
export async function GET(_request: NextRequest) {
  return NextResponse.json({
    data: [
      {
        deliveredAt: new Date("2026-03-29T12:00:00.000Z"),
        eventId: "evt_123",
        id: "attempt_001",
        status: "delivered",
      },
    ],
    limit: 10,
    page: 1,
    total: 1,
    totalPages: 1,
  });
}

/**
 * Register a webhook endpoint
 * @summary Register webhook
 * @description Creates a webhook endpoint while the preserved OpenAPI fragments contribute callbacks, links, examples, and discriminator mappings.
 * @body CreateWebhookEndpointSchema
 * @response WebhookEndpointSchema
 * @examples body:webhookRegistrationExamples
 * @tag Integrations
 * @tags Webhooks, Platform
 * @callback webhookDelivery {$request.body#/deliveryUrl} WebhookEnvelope
 * @link 200 deliveryAttempts getWebhookDeliveryAttempts
 * @servers https://api.example.com/v1, https://api-eu.example.com/v1
 * @externalDocs https://docs.example.com/integrations/webhooks Webhook authoring guide
 * @auth bearer
 * @operationId mixedRegisterWebhookEndpoint
 * @openapi
 */
export async function POST(request: NextRequest) {
  const webhookSecret = process.env.WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json({ error: "Webhook secret is not configured" }, { status: 500 });
  }

  const signature = request.headers.get("x-webhook-signature");
  const rawBody = await request.text();

  if (!verifyWebhookSignature(rawBody, signature, webhookSecret)) {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
  }

  const payload: unknown = JSON.parse(rawBody);
  const body = CreateWebhookEndpointSchema.parse(payload);

  return NextResponse.json(
    WebhookEndpointSchema.parse({
      ...body,
      id: "hook_123",
      secretPreview: "whsec_************************",
      status: "verified",
    }),
    { status: 201 },
  );
}
