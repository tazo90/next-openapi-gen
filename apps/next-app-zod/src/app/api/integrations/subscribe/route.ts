import { NextResponse } from "next/server";

import { CreateSubscriptionBody, SubscriptionResponse } from "@/schemas/webhook";

/**
 * Subscribe to payment events
 * @summary Create subscription
 * @description
 * Registers a callback URL that will receive signed payment events.
 * Uses `@callback` to declare the out-of-band webhook contract and
 * `@link` so clients can follow up to the created subscription.
 * @tag Integrations
 * @tags Webhooks
 * @body CreateSubscriptionBody
 * @bodyDescription Subscription registration payload
 * @response 201:SubscriptionResponse:Subscription created
 * @responseHeader 201 Location string URL of the created subscription
 * @callback paymentEvent {$request.body#/callbackUrl} SubscriptionEventPayload
 * @link 201 getSubscription zodGetSubscription
 * @servers https://api.example.com/v1, https://api-eu.example.com/v1
 * @externalDocs https://docs.example.com/integrations/webhooks Webhook signing guide
 * @security BearerAuth
 * @operationId zodCreateSubscription
 * @openapi
 */
export async function POST(request: Request) {
  CreateSubscriptionBody.parse(await request.json());
  return NextResponse.json({}, { status: 201 });
}
