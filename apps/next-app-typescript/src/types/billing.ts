/**
 * Billing domain types.
 *
 * This module is a deliberate showcase of TypeScript features the
 * generator supports end-to-end: `readonly` modifiers, tuples with
 * named members and rest, index signatures, mapped types, template
 * literal enums, utility types, `bigint`, `as const`, and
 * property-level `@openapi-override`.
 */

/**
 * Role identifiers derived from an `as const` map.
 * Exercises `typeof ROLE_MAP[keyof typeof ROLE_MAP]` enum inference.
 */
export const ROLE_MAP = {
  OWNER: "owner",
  BILLING_MANAGER: "billing_manager",
  VIEWER: "viewer",
} as const;

export type Role = (typeof ROLE_MAP)[keyof typeof ROLE_MAP];

/**
 * Slug string derived from `Uppercase<T>` + template literals.
 */
export type InvoiceNamespace = Uppercase<"billing" | "receivables">;
export type InvoiceSlug = `${InvoiceNamespace}-${string}`;

/**
 * Template-literal enum of event names the billing system emits.
 */
export type BillingEventName = `${"invoice" | "payment"}.${"created" | "updated" | "paid"}`;

/**
 * Named tuple with a rest element — exercises `TSNamedTupleMember`
 * and `TSRestType`.
 */
export type AmountBreakdown = [
  subtotalMinor: number,
  taxMinor: number,
  ...adjustmentsMinor: number[],
];

/**
 * Tuple without names — exercises basic `TSTupleType`.
 */
export type MoneyPair = [currency: string, amountMinor: number];

/**
 * Object with an index signature — exercises `TSIndexSignature`.
 */
export type AuditMeta = {
  [key: string]: string | number;
};

/**
 * Exercises `readonly` modifier on object properties and
 * property-level `@openapi-override`.
 */
export type Invoice = {
  readonly id: string;
  /**
   * @openapi-override { "format": "email", "maxLength": 320 }
   */
  customerEmail: string;
  /**
   * Monetary amount in the smallest currency unit — emitted as
   * `integer` with `format: int64` via `bigint`.
   */
  amountMinor: bigint;
  currency: string;
  breakdown: AmountBreakdown;
  status: Exclude<"draft" | "open" | "paid" | "void" | "uncollectible", "void">;
  readonly createdAt: string;
  updatedAt: string;
  meta: AuditMeta;
};

/**
 * `Pick`/`Omit` chain with `keyof` — exercises the resolver.
 */
export type InvoiceListItem = Pick<
  Invoice,
  "id" | "customerEmail" | "amountMinor" | "status" | "createdAt"
>;

/**
 * `Readonly<T>` utility — auto-infers `readOnly: true` on every property.
 */
export type ImmutableInvoice = Readonly<InvoiceListItem>;

/**
 * `Mutable` mapped type — exercises `-readonly` mapping.
 */
export type Mutable<T> = { -readonly [K in keyof T]: T[K] };

export type DraftInvoice = Mutable<ImmutableInvoice>;

/**
 * `NonNullable<T>` + `Extract<T, U>` chain.
 */
export type FinalInvoiceStatus = NonNullable<Extract<Invoice["status"], "paid" | "uncollectible">>;

/**
 * Pagination response built with a generic, consumed by routes below.
 */
export type PaginatedResponse<T> = {
  data: T[];
  total: number;
  nextCursor: string | null;
};

export type InvoicesResponse = PaginatedResponse<InvoiceListItem>;

export type InvoiceIdParams = {
  /** Invoice identifier */
  id: string;
};

export type CreateInvoiceBody = Mutable<Omit<Invoice, "id" | "createdAt" | "updatedAt" | "meta">>;

export type InvoiceQuery = {
  status?: Invoice["status"];
  from?: string;
  to?: string;
  cursor?: string;
};

/**
 * Headers accepted on billing requests — target for `@header`.
 */
export type BillingRequestHeaders = {
  /** Tenant identifier */
  "X-Tenant-Id": string;
  /** Idempotency key (optional) */
  "Idempotency-Key"?: string;
};

/**
 * Cookies accepted on billing requests — target for `@cookie`.
 */
export type BillingCookies = {
  /** Session token */
  session: string;
};

/**
 * Interface declaration merging — the generator should merge both
 * member sets into a single OpenAPI schema.
 */
export interface BillingAttachment {
  id: string;
  filename: string;
}

export interface BillingAttachment {
  /**
   * Attachment contents, base64 encoded.
   *
   * @openapi-override { "contentEncoding": "base64", "contentMediaType": "application/octet-stream" }
   */
  data: string;
}
