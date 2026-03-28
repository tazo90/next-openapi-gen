# JSDoc Reference

This guide collects the route-level JSDoc tags supported by
`next-openapi-gen`, along with the most common patterns for documenting
handlers.

## Core rule

Use explicit tags when you want stable, predictable output. In particular,
explicit `@response` metadata always wins over inferred responses.

## Tag reference

| Tag                       | Purpose                                                                 |
| ------------------------- | ----------------------------------------------------------------------- |
| `@description`            | Operation description                                                   |
| `@operationId`            | Override the generated operation ID                                     |
| `@pathParams`             | Path parameter schema or type                                           |
| `@params`                 | Query parameter schema or type                                          |
| `@queryParams`            | Alias for `@params` when tooling conflicts with `@params`               |
| `@querystring`            | OpenAPI `3.2` querystring schema with an optional parameter name        |
| `@body`                   | Request body schema or type                                             |
| `@bodyDescription`        | Request body description                                                |
| `@examples`               | Inline, serialized, external, or exported examples                      |
| `@response`               | Response schema, code, and optional description                         |
| `@responseDescription`    | Response description without redefining the schema                      |
| `@responseContentType`    | Override the response media type                                        |
| `@responseItem`           | OpenAPI `3.2` sequential media item schema                              |
| `@responseItemEncoding`   | OpenAPI `3.2` sequential media item encoding                            |
| `@responsePrefixEncoding` | OpenAPI `3.2` sequential media prefix encoding                          |
| `@responseSet`            | Use a named response set from `next.openapi.json`                       |
| `@add`                    | Add extra responses to the operation                                    |
| `@contentType`            | Request content type such as `multipart/form-data`                      |
| `@auth`                   | Operation security requirement(s)                                       |
| `@tag`                    | Operation tag                                                           |
| `@tagSummary`             | OpenAPI `3.2` tag summary                                               |
| `@tagKind`                | OpenAPI `3.2` tag kind                                                  |
| `@tagParent`              | OpenAPI `3.2` tag parent                                                |
| `@deprecated`             | Mark the operation as deprecated                                        |
| `@openapi`                | Explicitly include the operation when `includeOpenApiRoutes` is enabled |
| `@ignore`                 | Exclude the operation from generation                                   |
| `@method`                 | Required HTTP method tag for Pages Router handlers                      |

## Common patterns

### Path parameters

```ts
const UserParams = z.object({
  id: z.string().describe("User ID"),
});

/**
 * Get a user
 * @pathParams UserParams
 * @response UserResponse
 * @openapi
 */
export async function GET() {
  return Response.json({ ok: true });
}
```

### Query parameters

```ts
const UsersQueryParams = z.object({
  page: z.number().optional().describe("Page number"),
  limit: z.number().optional().describe("Results per page"),
});

/**
 * List users
 * @params UsersQueryParams
 * @openapi
 */
export async function GET() {
  return Response.json({ ok: true });
}
```

### Request bodies

```ts
const CreateUserBody = z.object({
  name: z.string(),
  email: z.string().email(),
});

/**
 * Create a user
 * @body CreateUserBody
 * @bodyDescription User registration payload
 * @response 201:UserResponse
 * @openapi
 */
export async function POST() {
  return Response.json({ ok: true }, { status: 201 });
}
```

### Responses

```ts
/**
 * Get a user
 * @response UserResponse
 * @responseDescription Returns the user record
 * @openapi
 */
export async function GET() {
  return Response.json({ ok: true });
}
```

Alternative forms:

- `@response UserResponse`
- `@response 201:UserResponse`
- `@response UserResponse:Returns the user profile`
- `@response 201:UserResponse:User created successfully`

### Authentication

```ts
/**
 * Get a protected resource
 * @auth bearer
 * @openapi
 */
export async function GET() {
  return Response.json({ ok: true });
}
```

Comma-separated values produce alternative security requirements. For example,
`@auth bearer,SessionCookie` generates a requirement that accepts either scheme.
Advanced `securitySchemes` objects should still be modeled in templates or
reusable OpenAPI fragments.

### File uploads

```ts
const FileUploadSchema = z.object({
  file: z.custom<File>().describe("Image file"),
  description: z.string().optional(),
});

/**
 * Upload a file
 * @body FileUploadSchema
 * @contentType multipart/form-data
 * @response UploadResponse
 * @openapi
 */
export async function POST() {
  return Response.json({ ok: true });
}
```

### Deprecation and custom operation IDs

```ts
/**
 * Legacy endpoint
 * @deprecated
 * @operationId getLegacyUser
 * @response UserResponse
 * @openapi
 */
export async function GET() {
  return Response.json({ ok: true });
}
```

### Pages Router handlers

For Pages Router, add `@method` so the generator can map the exported handler to
an HTTP verb:

```ts
/**
 * @method GET
 * @response UserResponse
 * @openapi
 */
export default function handler() {
  return;
}
```

## Examples

`@examples` supports several styles:

- inline JSON values
- serialized wire-format payloads
- external URLs
- exported typed references

Example:

```ts
export const streamQueryExamples = [
  {
    name: "filters",
    value: { status: "active" },
  },
];

/**
 * @examples querystring:streamQueryExamples
 * @openapi
 */
export async function GET() {
  return Response.json({ ok: true });
}
```

## OpenAPI 3.2 features

When targeting OpenAPI `3.2`, you can model richer route metadata directly from
JSDoc:

```ts
/**
 * Stream events
 * @tag Events
 * @tagSummary Event navigation
 * @tagKind nav
 * @querystring SearchFilter as advancedQuery
 * @responseContentType text/event-stream
 * @responseItem EventChunk
 * @responseItemEncoding {"headers":{"content-type":"application/json"}}
 * @openapi
 */
export async function GET() {
  return new Response(null, { status: 200 });
}
```

These `3.2`-specific fields are version-aware and are stripped or downgraded for
older OpenAPI targets where appropriate.

## Response sets and extra responses

If you use `responseSets` in `next.openapi.json`, routes can opt into them with
`@responseSet` and extend them with `@add`:

```ts
/**
 * Update a user
 * @response UserResponse
 * @responseSet auth
 * @add 429:RateLimitResponse
 * @openapi
 */
export async function PUT() {
  return Response.json({ ok: true });
}
```

## Inference notes

- If `@response` is present, it is authoritative.
- If `@response` is absent, App Router handlers can infer typed
  `NextResponse.json(...)` or `Response.json(...)` returns.
- Inference is best-effort, not a replacement for explicit documentation when
  you need exact component names and response metadata.

## Related guides

- [Getting started and configuration](./getting-started.md)
- [Workflows and integrations](./workflows-and-integrations.md)
- [OpenAPI version coverage](./openapi-version-coverage.md)
