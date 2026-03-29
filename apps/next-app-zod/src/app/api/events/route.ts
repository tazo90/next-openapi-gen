import {
  EventExportJob,
  EventSearchRequest,
  EventSearchResponse,
  EventStreamQuery,
  eventSearchBodyExamples,
  eventStreamQueryExamples,
  eventStreamResponseExamples,
} from "@/schemas/event";

/**
 * Stream platform events
 * @description Streams event records with first-class OpenAPI 3.2 querystring and sequential media metadata.
 * @tag Events
 * @tagSummary Event navigation
 * @tagKind nav
 * @tagParent Platform
 * @querystring EventStreamQuery as advancedQuery
 * @responseContentType text/event-stream
 * @responseItem EventChunk
 * @responseItemEncoding {"headers":{"content-type":"application/json"}}
 * @responsePrefixEncoding [{"type":"text","text":"event: message\ndata: "},{"type":"text","text":"\n\n"}]
 * @examples querystring:eventStreamQueryExamples
 * @examples response:eventStreamResponseExamples
 * @auth bearer
 * @operationId zodStreamPlatformEvents
 * @openapi
 */
export async function GET(request: Request) {
  EventStreamQuery.parse(Object.fromEntries(new URL(request.url).searchParams.entries()));

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(
        encoder.encode(
          'event: message\ndata: {"id":"evt_001","product":"catalog","sequence":17,"status":"active","emittedAt":"2026-03-29T12:00:00.000Z","payload":{"actorId":"user_123","summary":"Catalog publish completed"}}\n\n',
        ),
      );
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
    },
    status: 200,
  });
}

/**
 * Search platform events
 * @description Searches the retained event log and can schedule an async export job for larger result sets.
 * @tag Events
 * @body EventSearchRequest
 * @response EventSearchResponse
 * @add 202:EventExportJob:Async export job accepted
 * @examples body:eventSearchBodyExamples
 * @responseSet common
 * @operationId zodSearchPlatformEvents
 * @openapi
 */
export async function POST(request: Request) {
  const body = EventSearchRequest.parse(await request.json());

  if (body.query.length > 20) {
    return Response.json(
      EventExportJob.parse({
        id: "job_evt_export_123",
        status: "queued",
        submittedAt: "2026-03-29T12:05:00.000Z",
      }),
      { status: 202 },
    );
  }

  return Response.json(
    EventSearchResponse.parse({
      data: [
        {
          emittedAt: "2026-03-29T12:00:00.000Z",
          id: "evt_001",
          payload: {
            actorId: "user_123",
            summary: `Matched query: ${body.query}`,
          },
          product: body.product ?? "catalog",
          sequence: 17,
          status: body.statuses?.[0] ?? "active",
        },
      ],
      nextCursor: null,
      total: 1,
    }),
  );
}
