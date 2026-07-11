import { z } from "zod";

export const PaymentWebhookPayload = z.object({
  eventId: z.string().uuid(),
  amount: z.number().int().positive(),
});

/**
 * Payment webhook
 * @webhook paymentReceived
 * @body PaymentWebhookPayload
 * @response 204
 * @openapi
 */
export async function POST(request: Request) {
  const payload = PaymentWebhookPayload.parse(await request.json());
  return new Response(null, { status: 204 });
}
