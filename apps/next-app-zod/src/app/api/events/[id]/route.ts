import { NextRequest, NextResponse } from "next/server";

import { z } from "zod";

export const EventIdParams = z.object({
  id: z.string().describe("Event identifier"),
});

type RouteContext = {
  params: Promise<{ id: string }>;
};

/**
 * Fetch a single event
 * @summary Get event
 * @description Returns the full record for a previously streamed event.
 * @tag Events
 * @tags Platform
 * @pathParams EventIdParams
 * @response EventChunk
 * @responseHeader 200 ETag string Strong ETag for optimistic concurrency
 * @responseHeader 200 Cache-Control string Caching hint for intermediaries
 * @link 200 searchEvents zodSearchPlatformEvents
 * @auth bearer
 * @operationId zodGetEvent
 * @openapi
 */
export async function GET(_request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  return NextResponse.json({ id });
}
