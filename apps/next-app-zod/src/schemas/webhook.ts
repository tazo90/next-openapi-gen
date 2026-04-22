import { z } from "zod";

/**
 * Branded UserId — exercised by `z.brand<"UserId">()`.
 */
export const UserId = z.uuid().brand<"UserId">();

/**
 * Branded idempotency key stored as a nanoid.
 */
export const IdempotencyKey = z.nanoid().brand<"IdempotencyKey">();

/**
 * Shared envelope for every webhook event delivered to customer
 * endpoints. Exercises `z.readonly()` on server-owned fields and
 * `.merge()` in the concrete event bodies below.
 */
export const WebhookEnvelopeSchema = z.object({
  id: z.ulid().readonly().describe("Unique event identifier"),
  idempotencyKey: IdempotencyKey.describe("Unique key de-duplicating retried deliveries"),
  deliveredAt: z.preprocess(
    (value) => (typeof value === "string" ? new Date(value) : value),
    z.date().describe("Delivery timestamp (ISO string coerced to Date)"),
  ),
  apiVersion: z.literal("2026-04-01").describe("API version the payload is serialized against"),
  /** Metadata is forwarded verbatim to subscribers. */
  metadata: z.record(z.string(), z.string()).optional().describe("Free-form key/value metadata"),
});

/**
 * Core payment fields that each concrete event extends.
 */
const PaymentCoreSchema = z.object({
  paymentId: z.ulid().describe("Payment identifier"),
  userId: UserId.describe("User the payment belongs to"),
  amountMinor: z
    .number()
    .int()
    .positive()
    .multipleOf(1)
    .describe("Amount in the smallest currency unit"),
  currency: z
    .string()
    .length(3)
    .regex(/^[A-Z]{3}$/)
    .describe("ISO-4217 currency code"),
});

/**
 * `payment.succeeded` webhook body. Uses `.merge()` to combine the
 * envelope and the payment core, plus the branded `UserId`.
 */
export const PaymentSucceededEvent = WebhookEnvelopeSchema.merge(PaymentCoreSchema).extend({
  type: z.literal("payment.succeeded"),
  receiptUrl: z.url().describe("Hosted receipt accessible to the customer"),
});

/**
 * `payment.failed` webhook body.
 */
export const PaymentFailedEvent = WebhookEnvelopeSchema.merge(PaymentCoreSchema).extend({
  type: z.literal("payment.failed"),
  failureCode: z
    .enum(["card_declined", "expired_card", "insufficient_funds", "unknown"])
    .describe("Reason the payment failed"),
  retriable: z.boolean().describe("Whether a retry is likely to succeed"),
});

/**
 * `payment.refunded` webhook body.
 */
export const PaymentRefundedEvent = WebhookEnvelopeSchema.merge(PaymentCoreSchema).extend({
  type: z.literal("payment.refunded"),
  refundedAmountMinor: z
    .number()
    .int()
    .nonnegative()
    .describe("Refund amount in the smallest currency unit"),
});

/**
 * Full discriminated union delivered to payment webhooks.
 * When the tag is missing, callers should fall back to the
 * `payment.succeeded` variant — we annotate that explicitly in
 * the route handler via `@discriminator defaultMapping=...`.
 */
export const PaymentEvent = z.discriminatedUnion("type", [
  PaymentSucceededEvent,
  PaymentFailedEvent,
  PaymentRefundedEvent,
]);

/**
 * `@callback` payload for the `integrations/subscribe` route.
 * Reuses the same event envelope so examples stay coherent.
 */
export const SubscriptionEventPayload = WebhookEnvelopeSchema.extend({
  type: z.literal("integration.ping"),
  subscriptionId: z.ulid().describe("Subscription identifier"),
});

/**
 * Request body for `POST /api/integrations/subscribe`.
 * Exercises `.strict()` so unknown fields are rejected.
 */
export const CreateSubscriptionBody = z
  .object({
    callbackUrl: z.url().describe("HTTPS URL that will receive events"),
    events: z
      .array(z.enum(["payment.succeeded", "payment.failed", "payment.refunded"]))
      .min(1)
      .describe("Event types this subscription receives"),
    secret: z.string().min(32).describe("Shared HMAC secret used to sign deliveries"),
  })
  .strict();

export const SubscriptionResponse = z.object({
  id: z.ulid().describe("Subscription identifier"),
  callbackUrl: z.url().describe("Registered callback URL"),
  createdAt: z.date().readonly().describe("Subscription creation time"),
});

export type PaymentEventType = z.infer<typeof PaymentEvent>;
export type CreateSubscription = z.infer<typeof CreateSubscriptionBody>;
