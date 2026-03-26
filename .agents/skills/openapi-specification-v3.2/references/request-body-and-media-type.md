---
name: request-body-and-media-type
description: Request Body, Media Type Object, Encoding, and sequential media types in OpenAPI 3.2
---

# Request Body and Media Type

## Request Body Object

| Field        | Type   | Description |
|-------------|--------|-------------|
| description | string | Brief description; CommonMark allowed. |
| content     | Map[string, Media Type \| Reference] | **REQUIRED**. Media type or range → description. SHOULD have at least one entry. Most specific key wins (e.g. text/plain over text/*). |
| required    | boolean | Default false. |

## Media Type Object

Describes content for the given media type. Keys: media type or media type range.

| Field         | Type   | Description |
|---------------|--------|-------------|
| schema        | Schema Object | Complete content. |
| itemSchema    | Schema Object | Each item in a [sequential media type](#sequential-media-types) (e.g. application/jsonl, text/event-stream). |
| example, examples | Any / Map | Mutually exclusive; examples SHOULD match schema and format. |
| encoding      | Map[string, Encoding Object] | By property name; only for multipart or application/x-www-form-urlencoded. MUST NOT be present if prefixEncoding or itemEncoding present. |
| prefixEncoding | [Encoding Object] | By position (multipart). |
| itemEncoding  | Encoding Object | For multiple array items (multipart); supports streaming. |

- `schema` applies to **complete** content; streaming is challenging.
- For **sequential media types** (e.g. application/jsonl, application/x-ndjson, text/event-stream, multipart/mixed): content is a repeating structure; implementations MUST map to JSON Schema data model as array. Use `itemSchema` for per-item validation in streaming.

## Encoding Object

Applied to a single value; mapping defined by Media Type Object (encoding by name or by position).

| Field         | Type   | Description |
|---------------|--------|-------------|
| contentType   | string | Comma-separated; specific or wildcard (e.g. image/*). Defaults by type (e.g. string+no contentEncoding → text/plain; object/array → application/json). |
| headers       | Map[string, Header \| Reference] | For multipart; Content-Type ignored here. |
| style, explode, allowReserved | string/boolean | RFC6570-style serialization; only for application/x-www-form-urlencoded or multipart/form-data. |
| encoding, prefixEncoding, itemEncoding | Map / [Encoding] / Encoding | Nested encoding (e.g. nested multipart). |

## Example (request body)

```yaml
requestBody:
  description: user to add
  required: true
  content:
    application/json:
      schema:
        $ref: '#/components/schemas/User'
    application/x-www-form-urlencoded:
      schema:
        type: object
        properties:
          name: { type: string }
          status: { type: string }
      encoding:
        name: {}
        status: {}
```

## Key points

- Request body `content` key is media type or range; most specific match wins.
- File upload: use `application/octet-stream` or specific type (e.g. image/png) with empty schema `{}`; multiple files use multipart.
- Sequential media types: use `itemSchema` (and optionally `itemEncoding` for multipart) for streaming; `schema` for full array.

<!--
Source references:
- https://github.com/OAI/OpenAPI-Specification/blob/main/versions/3.2.0.md
-->
