# JSDoc Reference

This guide collects the route-level JSDoc tags supported by
`next-openapi-gen`, along with the most common patterns for documenting
handlers.

## Core rule

Use explicit tags when you want stable, predictable output. In particular,
explicit `@response` metadata always wins over inferred responses.

## Tag reference

| Tag                       | Purpose                                                                                   |
| ------------------------- | ----------------------------------------------------------------------------------------- |
| `@description`            | Operation description                                                                     |
| `@summary`                | Operation summary (overrides the first JSDoc line)                                        |
| `@operationId`            | Override the generated operation ID                                                       |
| `@pathParams`             | Path parameter schema or type                                                             |
| `@params`                 | Query parameter schema or type                                                            |
| `@queryParams`            | Alias for `@params` when tooling conflicts with `@params`                                 |
| `@querystring`            | OpenAPI `3.2` querystring schema with an optional parameter name                          |
| `@header`                 | Header parameter schema or type (`in: header`)                                            |
| `@cookie`                 | Cookie parameter schema or type (`in: cookie`)                                            |
| `@body`                   | Request body schema or type                                                               |
| `@bodyDescription`        | Request body description                                                                  |
| `@examples`               | Inline, serialized, external, or exported examples                                        |
| `@response`               | Response schema, code, and optional description                                           |
| `@responseDescription`    | Response description without redefining the schema                                        |
| `@responseContentType`    | Override the response media type                                                          |
| `@responseHeader`         | Add a response header (`status name type [description]`)                                  |
| `@responseItem`           | OpenAPI `3.2` sequential media item schema                                                |
| `@responseItemEncoding`   | OpenAPI `3.2` sequential media item encoding                                              |
| `@responsePrefixEncoding` | OpenAPI `3.2` sequential media prefix encoding                                            |
| `@responseSet`            | Use a named response set from `next.openapi.json`                                         |
| `@add`                    | Add extra responses to the operation                                                      |
| `@contentType`            | Request content type such as `multipart/form-data`                                        |
| `@auth`                   | Operation security requirement(s) via preset names                                        |
| `@security`               | Explicit security requirements (`Scheme1, Scheme2:scope1\|scope2`)                        |
| `@link`                   | OpenAPI response link (`status name operationId\|#/components/...`)                       |
| `@callback`               | OpenAPI callback (`name runtimeExpression [reference]`)                                   |
| `@webhook`                | Mark the handler as a webhook (optional webhook name)                                     |
| `@servers`                | Operation-level servers (comma-separated URLs)                                            |
| `@externalDocs`           | Operation-level external documentation (`url [description]`)                              |
| `@tag`                    | Operation tag                                                                             |
| `@tags`                   | Additional operation tags (comma-separated)                                               |
| `@tagSummary`             | OpenAPI `3.2` tag summary                                                                 |
| `@tagKind`                | OpenAPI `3.2` tag kind                                                                    |
| `@tagParent`              | OpenAPI `3.2` tag parent                                                                  |
| `@deprecated`             | Mark the operation as deprecated (optional reason on same line)                           |
| `@openapi`                | Explicitly include the operation when `includeOpenApiRoutes` is enabled                   |
| `@openapi-override`       | Deep-merge extra OpenAPI fields onto the operation (JSON object)                          |
| `@ignore`                 | Exclude the operation from generation                                                     |
| `@method`                 | Required HTTP method tag for Pages Router handlers                                        |
| `@id`                     | Override the generated OpenAPI component name for TypeScript types, interfaces, and enums |

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

When the schema referenced by `@params` already carries OpenAPI parameter
serialization fields, `next-openapi-gen` lifts them onto the generated
parameter object:

```ts
export const SearchParams = {
  type: "object",
  properties: {
    filter: {
      type: "object",
      properties: {
        status: {
          type: "string",
        },
      },
    },
    search: {
      type: "string",
      style: "form",
      explode: false,
      allowReserved: true,
    },
  },
};
```

Serialization notes:

- object-shaped query params default to `style: "deepObject"` and `explode: true`
  when you do not set an explicit style
- explicit `style`, `explode`, and `allowReserved` stay on the parameter object
  instead of being duplicated inside `schema`
- this behavior applies to OpenAPI `3.0`, `3.1`, and `3.2`; it is separate from
  the `3.2`-only `@querystring` tag

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

**Built-in presets** map the following lowercase keywords to scheme names:

| Keyword  | Default scheme name |
| -------- | ------------------- |
| `bearer` | `BearerAuth`        |
| `basic`  | `BasicAuth`         |
| `apikey` | `ApiKeyAuth`        |

You can override these or add new presets via the `authPresets` config option:

```ts
// openapi-gen.config.ts
export default defineConfig({
  authPresets: {
    bearer: "JwtAuth", // override default BearerAuth
    oauth2: "OAuth2Auth", // add a new preset
  },
  components: {
    securitySchemes: {
      JwtAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      OAuth2Auth: {
        type: "oauth2",
        flows: {
          /* ... */
        },
      },
    },
  },
});
```

Unknown values (e.g. `@auth MyCustomScheme`) are passed through unchanged regardless of preset configuration.

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

`@contentType multipart/form-data` also enables multipart-specific request-body
encoding output. The generator derives per-part `encoding` entries from the body
schema:

```ts
export const UploadBody = {
  type: "object",
  properties: {
    avatarFile: {
      type: "object",
      description: "Avatar file",
    },
    upload: {
      type: "object",
      description: "Avatar upload",
      contentMediaType: "image/png",
    },
  },
};
```

Multipart encoding rules:

- `contentMediaType` on a part wins and becomes `encoding.<part>.contentType`
- `type: "string"` with `format: "binary"` maps to
  `application/octet-stream`
- object-shaped parts whose property name or description contains `file`
  are treated as binary uploads and also map to `application/octet-stream`
- the same encoding generation applies when `@body` points at a reusable
  component schema rather than an inline definition

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

## Header and cookie parameters

Use `@header` and `@cookie` to document request headers and cookies. The
referenced schema is emitted as one OpenAPI parameter per property, with `in`
set to `header` or `cookie`.

```ts
const RequestHeaders = z.object({
  "X-Api-Key": z.string().describe("API key"),
  "X-Request-Id": z.string().uuid().optional(),
});

const SessionCookies = z.object({
  session: z.string().describe("Opaque session cookie"),
});

/**
 * @header RequestHeaders
 * @cookie SessionCookies
 * @response UserResponse
 * @openapi
 */
export async function GET() {
  return Response.json({ ok: true });
}
```

## Servers, external docs, and security

Operation-level `servers`, `externalDocs`, and `security` requirements can be
declared directly on the route.

```ts
/**
 * Subscribe to events
 * @servers https://api.example.com, https://staging.example.com
 * @externalDocs https://docs.example.com/events Event docs
 * @security BearerAuth, ApiKeyAuth:read:events|write:events
 * @openapi
 */
export async function POST() {
  return Response.json({ ok: true });
}
```

`@security` accepts comma-separated security requirements; use `Scheme:scope1|scope2`
to attach scopes to a scheme. `@auth` remains available for preset-based
shortcuts such as `bearer`, `basic`, and `apikey`.

## Response headers and links

Document response headers with `@responseHeader` and add OpenAPI links with
`@link`. Both annotations attach to the response identified by the status code.

```ts
/**
 * Create a user
 * @response 201:UserResponse
 * @responseHeader 201 Location string Newly created user URL
 * @responseHeader 429 Retry-After integer Seconds to wait
 * @link 201 GetUser #/components/links/GetUser
 * @openapi
 */
export async function POST() {
  return Response.json({ ok: true }, { status: 201 });
}
```

## Webhooks and callbacks

Mark a handler as a webhook (OpenAPI `3.1`+ `webhooks` section) with
`@webhook`, and declare operation-level callbacks with `@callback`.

```ts
/**
 * @webhook newEvent
 * @body EventPayload
 * @openapi
 */
export async function POST() {
  return Response.json({ ok: true });
}

/**
 * Subscribe with a callback URL
 * @body SubscriptionRequest
 * @callback onEvent {$request.body#callbackUrl} EventPayload
 * @openapi
 */
export async function POST() {
  return Response.json({ ok: true });
}
```

## Wildcard and default status codes

`@response` accepts OpenAPI `3.x` wildcard status codes and `default`.

```ts
/**
 * @response 2XX:UserResponse Any successful response
 * @response 4XX:ErrorResponse Any client error
 * @response default:ErrorResponse Fallback
 * @openapi
 */
export async function GET() {
  return Response.json({ ok: true });
}
```

## TypeScript property comments

Property descriptions on TypeScript `type` and `interface` declarations come
from comments. Both styles are supported and can be mixed freely in the same
type:

```ts
type LoginBody = {
  /** User email address */
  email: string;

  password: string; // user password
};
```

- **Leading** (`/** ... */` or `// ...` on the line above the property) —
  canonical JSDoc style; takes precedence when both are present on the same
  property.
- **Trailing** (`prop: T; // ...`) — concise inline form; used as a fallback
  when no leading comment is attached.

Both forms support the same set of JSDoc tags:

| Tag        | Effect on the generated property schema                                          |
| ---------- | -------------------------------------------------------------------------------- |
| `@example` | Sets `example` — JSON-parsed when possible (strings, numbers, booleans, objects) |
| `@format`  | Sets `format` (e.g. `date-time`, `email`, `uri`)                                 |

```ts
type Health = {
  /** @example "alive" */
  status: string;

  /** Process uptime in seconds @example 123.45 */
  uptime: number;

  /** @format date-time @example "2025-11-26T22:00:00.000Z" */
  startedAt: string;

  // Trailing comments parse the same tags
  region: string; // @example "eu-central-1"
};
```

For Zod schemas, use `.describe()` / `.meta()` instead — see the
[README](../README.md#add-openapi-metadata-directly-in-zod-schemas).

## Escape hatch: openapi-override

`@openapi-override` takes a JSON object that is deep-merged onto the final
operation definition. Use this sparingly for vendor extensions or fields not
covered by a dedicated tag.

```ts
/**
 * Priority endpoint
 * @response UserResponse
 * @openapi-override {"x-internal": true, "x-rate-limit": 100}
 * @openapi
 */
export async function GET() {
  return Response.json({ ok: true });
}
```

`@openapi-override` also works at the property level inside TypeScript type
declarations — the JSON object is merged onto the property schema after
inference, so it is the officially supported escape hatch for attributes the
generator cannot infer (custom formats, vendor extensions, tightened
constraints, etc.):

```ts
type User = {
  id: string;
  /**
   * @openapi-override { "format": "email", "maxLength": 320 }
   */
  email: string;
};
```

## Automatic inference

The generator infers OpenAPI fields from the schema where possible, so you do
not have to annotate them explicitly.

- `z.discriminatedUnion("kind", [...])` emits `discriminator.propertyName` and
  a `mapping` built from each variant's literal `kind` value when variants are
  stored as `$ref`.
- `z.readonly()` and TypeScript `Readonly<T>` emit `readOnly: true` on the
  schema.
- `z.object({ file: z.custom<File>() })` combined with
  `@contentType multipart/form-data` produces per-part `encoding` entries that
  map file properties to `application/octet-stream` or the declared
  `contentMediaType`.
- Typed `NextResponse.json(...)` and `Response.json(...)` returns in App
  Router handlers are inferred as response schemas when `@response` is absent.

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

For version-neutral behavior such as multipart request-body encoding and query
parameter serialization, see the earlier sections in this guide. For the full
version matrix, see [OpenAPI version coverage](./openapi-version-coverage.md).

For a runnable checked-in example, see the event routes in
[`../apps/next-app-zod/src/app/api/events`](../apps/next-app-zod/src/app/api/events).

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

## Component naming

By default, component names in the OpenAPI spec are derived from the export identifier. Use the following
mechanisms to decouple the component name from the source identifier — useful when migrating from
another generator or when enforcing consistent PascalCase naming.

### Zod — `.meta({ id })`

Use the Zod v4 `.meta({ id })` field to set the component name explicitly:

```ts
export const audioSchema = z
  .object({
    url: z.url(),
    title: z.string().nullable().optional(),
  })
  .meta({ id: "Audio" });
```

The value of `id` becomes the key in `components.schemas`. Existing `@body audioSchema` or
`@response audioSchema` references in route handlers continue to work — the generator resolves them
transparently to the override name.

The `id` field is **not** emitted into the schema body.

### TypeScript — `@id`

Add `/** @id ComponentName */` as a leading JSDoc comment on any `interface`, `type`, or `enum`
declaration:

```ts
/** @id Audio */
export interface AudioInterface {
  url: string;
  title?: string | null;
}
```

An inline trailing comment is also supported:

```ts
export interface AudioInterface {
  // @id Audio
  url: string;
}
```

In both cases, the component is registered as `Audio` and cross-type references resolve correctly
to `#/components/schemas/Audio`.

## Related guides

- [Getting started and configuration](./getting-started.md)
- [Workflows and integrations](./workflows-and-integrations.md)
- [OpenAPI version coverage](./openapi-version-coverage.md)
