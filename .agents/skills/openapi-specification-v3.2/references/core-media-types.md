---
name: core-media-types
description: Media types and content keys in OpenAPI 3.2
---

# Media Types

In OpenAPI 3.2, media types are used as **keys** in `content` maps (Request Body, Response, Parameter with `content`, Header with `content`, Media Type Object). They identify the format of the payload or value.

## Where they are used

- **Request Body:** `requestBody.content` — key = media type or [media type range](https://www.rfc-editor.org/rfc/rfc9110.html#appendix-A); value = Media Type Object. Most specific key wins (e.g. `text/plain` over `text/*`).
- **Response:** `response.content` — same; most specific key wins.
- **Parameter (content):** `parameter.content` — **one** entry; key = media type.
- **Header (content):** `header.content` — **one** entry; key = media type.
- **Encoding Object:** `contentType` — comma-separated list of specific or wildcard (e.g. `image/*`).

Media types are publicly registered in the [IANA media types registry](https://www.iana.org/assignments/media-types/media-types.xhtml) (RFC 6838). APIs may use vendor types (e.g. `application/vnd.github.v3+json`).

## OpenAPI Media Type Registry

The OpenAPI Initiative maintains a [Media Type Registry](https://spec.openapis.org/registry/media-type/) summarizing media type support expected by the spec and linking to IANA and related specs. Additional media types may be added for extensions or later versions.

## Common patterns

- `application/json`, `application/xml`, `application/x-www-form-urlencoded`, `multipart/form-data`, `multipart/mixed`, `text/plain`, `text/event-stream`
- Sequential: `application/jsonl`, `application/x-ndjson`, `application/json-seq`
- Vendor: `application/vnd.*`, `application/vnd.github+json`

## Key points

- Content keys are media type or media type range; most specific match applies when multiple keys match.
- For file upload use `application/octet-stream` or specific type (e.g. `image/png`); multiple files use `multipart/form-data` or `multipart/mixed`.

<!--
Source references:
- https://github.com/OAI/OpenAPI-Specification/blob/main/versions/3.2.0.md
-->
