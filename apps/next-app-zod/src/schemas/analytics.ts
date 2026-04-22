import { z } from "zod";

/**
 * Allowed metric identifiers. Referenced as the key enum of a
 * `z.record(key, value)` to exercise the two-arg form.
 */
export const MetricKey = z.enum([
  "requests_per_second",
  "errors_per_second",
  "latency_p95_ms",
  "latency_p99_ms",
]);

/**
 * Tuple `[timestamp, value]` — exercises `z.tuple([...])`.
 */
export const MetricPoint = z.tuple([
  z.number().int().describe("Unix epoch milliseconds"),
  z.number().finite().describe("Metric value"),
]);

/**
 * Base filter object. Demonstrates `.catchall(z.string())` so
 * unknown tag filters are accepted as strings.
 */
const BaseFilter = z
  .object({
    product: z.enum(["catalog", "billing", "identity"]).optional(),
    env: z.enum(["dev", "staging", "prod"]).optional(),
  })
  .catchall(z.string());

/**
 * Extra windowing filter. Combined with `BaseFilter` via
 * `z.intersection` in the request body below.
 */
const WindowFilter = z.object({
  since: z.string().datetime().describe("Inclusive window start"),
  until: z.string().datetime().describe("Exclusive window end"),
});

/**
 * Metric search request body. Exercises `z.intersection` and the
 * two-argument `z.record(KeyEnum, Value)` form.
 */
export const MetricQueryBody = z.intersection(BaseFilter, WindowFilter).and(
  z.object({
    metrics: z.array(MetricKey).min(1).describe("Metrics to aggregate"),
    tagFilters: z.record(z.string(), z.string()).optional().describe("Free-form tag filters"),
  }),
);

/**
 * Response envelope. `series` uses `z.record(KeyEnum, Value)`
 * (two-arg form) and a `z.map`/`z.set` for ancillary data.
 */
export const MetricQueryResponse = z.object({
  series: z.record(MetricKey, z.array(MetricPoint)).describe("Per-metric time series"),
  samples: z.set(z.ulid()).describe("Deduplicated set of sample ids contributing to the result"),
  cardinality: z.map(z.string(), z.number().int().nonnegative()).describe("Cardinality per tag"),
});

/**
 * Summary patch body — every nested field is optional, matching a
 * PATCH-style update. (Equivalent of the legacy `.deepPartial()`.)
 */
export const MetricSummaryPatch = z
  .object({
    owner: z
      .object({
        team: z.string().optional(),
        contactEmail: z.email().optional(),
      })
      .partial()
      .optional(),
    windows: z
      .object({
        default: z.iso.datetime().optional(),
        retention: z.iso.datetime().optional(),
      })
      .partial()
      .optional(),
  })
  .partial();

export type MetricQuery = z.infer<typeof MetricQueryBody>;
export type MetricResult = z.infer<typeof MetricQueryResponse>;
