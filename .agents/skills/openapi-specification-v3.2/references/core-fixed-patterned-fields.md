---
name: core-fixed-patterned-fields
description: Fixed fields vs patterned fields in OpenAPI 3.2
---

# Fixed and Patterned Fields

OAS objects expose two types of fields. This affects how you add or extend content.

## Fixed fields

- **Declared name:** Exactly one occurrence per object (e.g. `openapi`, `info`, `paths`, `servers`, `title`, `version`).
- **Type and meaning** are defined by the spec.
- Example: OpenAPI Object has fixed fields `openapi`, `$self`, `info`, `jsonSchemaDialect`, `servers`, `paths`, `webhooks`, `components`, `security`, `tags`, `externalDocs`.

## Patterned fields

- **Pattern** for the field name (e.g. `/{path}` for Paths, `^x-` for extensions).
- **Multiple occurrences** allowed; names MUST be unique within the containing object.
- Examples:
  - **Paths Object:** Pattern `/{path}` — each key is a path string starting with `/`.
  - **Components Object:** Each key (schemas, responses, parameters, etc.) is a map: key = logical name, value = object. Component keys MUST match `^[a-zA-Z0-9\.\-_]+$`.
  - **Responses Object:** Pattern = HTTP status code or `default`; Patterned = status code keys (e.g. `"200"`, `2XX`), plus `^x-`.
  - **Extensions:** Pattern `^x-` — any key starting with `x-`; value any JSON. `x-oai-`, `x-oas-` reserved.

## Where each appears

- **OpenAPI Object:** Fixed (openapi, $self, info, servers, paths, webhooks, components, security, tags, externalDocs), Patterned (^x-).
- **Paths Object:** Patterned (/{path}, ^x-).
- **Path Item:** Fixed ($ref, summary, description, get, put, post, delete, options, head, patch, trace, query, additionalOperations, servers, parameters), Patterned (^x-).
- **Responses Object:** Fixed (default), Patterned (HTTP status code keys including 1XX–5XX, ^x-).
- **Components:** Each subsection (schemas, parameters, responses, etc.) is a map: patterned keys (name → value).
- **Operation callbacks, Security Requirement, examples, content, encoding:** Patterned keys only.

## Key points

- Use fixed fields for standard structure; use patterned fields for open-ended maps (paths, component names, status codes, examples, x-).
- Patterned field names must be unique within that object (e.g. no duplicate path keys, no duplicate component names per section).

<!--
Source references:
- https://github.com/OAI/OpenAPI-Specification/blob/main/versions/3.2.0.md
-->
