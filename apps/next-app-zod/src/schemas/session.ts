import { z } from "zod";

/**
 * Header parameters sent with every authenticated request.
 * Demonstrates `@header` parameter resolution and string formats
 * (uuid, jwt) supported as top-level constructors in Zod v4.
 */
export const SessionRequestHeaders = z.object({
  "X-Api-Key": z.string().min(16).describe("API key issued to the caller"),
  "X-Request-Id": z.uuid().optional().describe("Client-supplied request id for tracing"),
  Authorization: z.jwt().describe("Bearer JWT granting access to the session"),
});

/**
 * Cookie parameters for the current session.
 * Demonstrates `@cookie` parameter resolution.
 */
export const SessionCookies = z.object({
  session: z.string().min(1).describe("Opaque server-side session identifier"),
  locale: z.enum(["en", "de", "pl"]).optional().describe("User's preferred locale"),
});

/**
 * Request body for creating a session. Exercises `.passthrough()`
 * so unknown authentication factors are forwarded upstream.
 */
export const CreateSessionBody = z
  .object({
    email: z.email().describe("Account email"),
    password: z.string().min(12).max(128).describe("Account password (min 12 chars)"),
    deviceId: z.nanoid().optional().describe("Trusted device identifier (nanoid)"),
    totp: z
      .string()
      .regex(/^\d{6}$/)
      .optional()
      .describe("One-time code from authenticator app"),
  })
  .passthrough();

/**
 * Response payload for a freshly minted session. Uses many of the
 * newly supported string formats (ulid / jwt / ipv4 / cidrv4 / e164)
 * plus `.readonly()` on auto-generated timestamps.
 */
export const SessionResponse = z.object({
  id: z.ulid().describe("Session identifier (ULID)"),
  token: z.jwt().describe("Signed session JWT"),
  refreshToken: z.base64().describe("Opaque refresh token (base64 encoded)"),
  user: z.object({
    id: z.uuid().describe("User id"),
    phone: z.e164().optional().describe("Contact phone number in E.164 format"),
    avatar: z.emoji().optional().describe("User-chosen emoji avatar"),
  }),
  ipAddress: z.ipv4().describe("Remote IPv4 address of the client"),
  network: z.cidrv4().optional().describe("CIDR range the client is part of"),
  createdAt: z.date().readonly().describe("Session creation timestamp"),
  expiresAt: z.date().describe("Session expiry timestamp"),
});

/**
 * Canonical error envelope used by every auth endpoint.
 */
export const AuthErrorResponse = z.object({
  code: z
    .enum(["invalid_credentials", "rate_limited", "locked", "unknown"])
    .describe("Machine-readable error code"),
  message: z.string().describe("Human-readable error message"),
  retryAfterSeconds: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe("Suggested wait before retry"),
});

export type CreateSession = z.infer<typeof CreateSessionBody>;
export type Session = z.infer<typeof SessionResponse>;
