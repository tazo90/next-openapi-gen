import { NextRequest, NextResponse } from "next/server";

import { z } from "zod";

/**
 * Branded identifier — exercises `z.brand`.
 */
const TraceId = z.string().nanoid().brand<"TraceId">();

const CoerceQuery = z.object({
  /** Coerced number from the query string */
  count: z.coerce.number().int().min(0).max(1000).default(10),
  /** Coerced boolean from "true"/"false" */
  active: z.coerce.boolean().optional(),
  /** Coerced ISO date */
  since: z.coerce.date().optional(),
});

const CoerceBody = z.object({
  /** Branded trace id, must match nanoid format */
  traceId: TraceId,
  /** Preprocessed amount: accepts string or number, normalizes to number */
  amount: z.preprocess(
    (value) => (typeof value === "string" ? Number(value) : value),
    z.number().finite().nonnegative(),
  ),
  /** Pipe: trims, then validates as email */
  email: z
    .string()
    .transform((s) => s.trim().toLowerCase())
    .pipe(z.string().email()),
});

const CoerceResponse = z.object({
  ok: z.literal(true),
  echoed: CoerceBody,
});

/**
 * Coerce, preprocess, brand, transform, pipe
 * @summary Coercion edge cases
 * @description Exercises `z.coerce`, `z.preprocess`, `z.brand<>`, `.transform()`, and `.pipe()` together.
 * @tag Edge cases
 * @tags Sandbox
 * @params CoerceQuery
 * @body CoerceBody
 * @response CoerceResponse
 * @operationId sandboxCoerceEdgeCases
 * @openapi
 */
export async function POST(request: NextRequest) {
  const body = CoerceBody.parse(await request.json());
  return NextResponse.json({ ok: true, echoed: body });
}
