import type {
  SessionActionInput,
  SessionEnvelope,
  SessionIdParam,
  SessionResource,
} from "@/types/transport";

type SessionRouteContext = {
  params: Promise<SessionIdParam>;
};

function buildSession(id: string, overrides: Partial<SessionResource> = {}): SessionEnvelope {
  return {
    data: {
      authChannel: "cookie",
      device: "MacBook Pro",
      id,
      ipAddress: "203.0.113.42",
      lastSeenAt: "2026-03-29T12:10:00.000Z",
      status: "active",
      userId: "user_123",
      ...overrides,
    },
    meta: {
      refreshed: false,
      requestId: "req_session_123",
    },
  };
}

/**
 * Get a session.
 * @description Demonstrates generic wrapper responses for session resources that can be authenticated by bearer, API key, or a session cookie.
 * @pathParams SessionIdParam
 * @response SessionEnvelope
 * @tag Sessions
 * @auth bearer,apikey
 * @operationId typescriptGetSession
 * @openapi
 */
export async function GET(_request: Request, { params }: SessionRouteContext) {
  const { sessionId } = await params;

  return Response.json(buildSession(sessionId));
}

/**
 * Update a session.
 * @description Extends or revokes a session while preserving the generic response envelope.
 * @pathParams SessionIdParam
 * @body SessionActionInput
 * @response SessionEnvelope
 * @tag Sessions
 * @auth bearer,PartnerToken
 * @operationId typescriptUpdateSession
 * @openapi
 */
export async function PATCH(request: Request, { params }: SessionRouteContext) {
  const { sessionId } = await params;
  const body = (await request.json()) as SessionActionInput;

  return Response.json(
    buildSession(sessionId, {
      status: body.revokeReason ? "revoked" : "active",
    }),
  );
}

/**
 * Delete a session.
 * @description Demonstrates 204 responses from typed route modules.
 * @pathParams SessionIdParam
 * @response 204
 * @tag Sessions
 * @auth bearer
 * @operationId typescriptDeleteSession
 * @openapi
 */
export async function DELETE(_request: Request, { params }: SessionRouteContext) {
  await params;
  return new Response(null, { status: 204 });
}
