import { z } from "zod";

export const EventStreamQuery = z.object({
  cursor: z.string().optional().describe("Opaque cursor for the next event window"),
  limit: z.number().int().min(1).max(100).optional().describe("Maximum events to stream"),
  product: z.enum(["catalog", "billing", "identity"]).optional().describe("Product event source"),
  status: z.enum(["active", "paused"]).optional().describe("Filter by stream status"),
});

export const EventChunk = z.object({
  id: z.string().describe("Event identifier"),
  product: z.enum(["catalog", "billing", "identity"]).describe("Product source"),
  sequence: z.number().int().describe("Monotonic event sequence number"),
  status: z.enum(["active", "paused"]).describe("Current stream state"),
  emittedAt: z.string().datetime().describe("Emission timestamp"),
  payload: z
    .object({
      actorId: z.string().describe("Actor or user that caused the event"),
      summary: z.string().describe("Short event summary"),
    })
    .describe("Structured event payload"),
});

export const EventSearchRequest = z.object({
  product: z.enum(["catalog", "billing", "identity"]).optional().describe("Product event source"),
  includeArchived: z.boolean().default(false).describe("Include archived events in search results"),
  statuses: z
    .array(z.enum(["active", "paused"]))
    .min(1)
    .optional()
    .describe("Statuses that should be returned"),
  query: z.string().min(2).describe("Free-text search term"),
});

export const EventSearchResponse = z.object({
  data: z.array(EventChunk).describe("Matching events"),
  nextCursor: z.string().nullable().describe("Cursor for the next page of results"),
  total: z.number().int().nonnegative().describe("Total matching events"),
});

export const EventExportJob = z.object({
  id: z.string().describe("Background export job identifier"),
  status: z.enum(["queued", "running"]).describe("Export job status"),
  submittedAt: z.string().datetime().describe("Submission timestamp"),
});

export const LegacyEventCsv = z.string().describe("Legacy CSV export payload");

export const eventStreamQueryExamples = [
  {
    name: "catalog-feed",
    value: {
      limit: 10,
      product: "catalog",
      status: "active",
    },
  },
];

export const eventSearchBodyExamples = [
  {
    name: "identity-search",
    value: {
      includeArchived: false,
      product: "identity",
      query: "session refresh",
      statuses: ["active"],
    },
  },
];

export const eventStreamResponseExamples = [
  {
    name: "structured",
    dataValue: {
      emittedAt: "2026-03-29T12:00:00.000Z",
      id: "evt_001",
      payload: {
        actorId: "user_123",
        summary: "Catalog publish completed",
      },
      product: "catalog",
      sequence: 17,
      status: "active",
    },
  },
  {
    name: "wire",
    serializedValue:
      'event: message\ndata: {"id":"evt_001","product":"catalog","sequence":17,"status":"active","emittedAt":"2026-03-29T12:00:00.000Z","payload":{"actorId":"user_123","summary":"Catalog publish completed"}}\n\n',
  },
  {
    externalValue: "https://example.com/openapi/events/catalog-stream.txt",
    name: "external",
  },
];

export const legacyEventExamples = [
  {
    name: "csv-preview",
    serializedValue:
      "id,product,status,sequence,emittedAt\nevt_001,catalog,active,17,2026-03-29T12:00:00.000Z\n",
  },
];
