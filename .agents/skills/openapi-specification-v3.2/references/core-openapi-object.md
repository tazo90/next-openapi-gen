---
name: core-openapi-object
description: Root OpenAPI object and required/optional fields for OpenAPI 3.2
---

# OpenAPI Object (Root)

Root of the OpenAPI Description (OAD). Defines version, optional base URI, metadata, servers, paths, webhooks, components, and security.

## Required fields

| Field    | Type   | Description |
|----------|--------|-------------|
| openapi  | string | MUST be the OAS version (e.g. `"3.2.0"`). Used by tooling to interpret the document. Not related to `info.version`. |
| info     | Info Object | **REQUIRED**. API metadata. |

At least one of `components`, `paths`, or `webhooks` MUST be present.

## Optional fixed fields

| Field            | Type   | Description |
|-----------------|--------|-------------|
| $self           | string | URI reference for this document; serves as base URI per RFC3986. Use for reference resolution; when present, implementations MUST support resolving API description URIs using it. |
| jsonSchemaDialect | string | Default `$schema` for Schema Objects in this document (MUST be a URI). |
| servers         | [Server Object] | Connectivity info; default one Server with `url: /` if absent or empty. |
| paths           | Paths Object | Available paths and operations. |
| webhooks        | Map[string, Path Item Object] | Incoming webhooks the consumer MAY implement; key = unique name. |
| components      | Components Object | Reusable objects (schemas, parameters, etc.). |
| security        | [Security Requirement Object] | API-wide security; OR between entries; operations can override. |
| tags            | [Tag Object] | Tags with metadata; order may be significant. |
| externalDocs    | External Documentation Object | Additional external documentation. |

## Patterned fields

- **Extensions:** `^x-` (e.g. `x-internal-id`) — any JSON value; vendor-specific.

## Reference resolution

When `$self` is present, references SHOULD use the target document's `$self` URI for interoperability. Supporting other URIs (e.g. retrieval URI) when `$self` is present is implementation-defined and NOT RECOMMENDED to rely on.

## Example (minimal)

```yaml
openapi: 3.2.0
info:
  title: My API
  version: "1.0.0"
paths:
  /pets:
    get:
      responses:
        "200":
          description: list of pets
          content:
            application/json:
              schema:
                type: array
                items: {}
```

## Key points

- `$self` is the recommended way to establish base URI in multi-document or relocated documents.
- Root `security` is OR: only one of the Security Requirement Objects need be satisfied; operations override with their own `security` or `[]` to clear.

<!--
Source references:
- https://github.com/OAI/OpenAPI-Specification/blob/main/versions/3.2.0.md
-->
