---
name: core-header-object
description: Header Object for response headers and multipart parts in OpenAPI 3.2
---

# Header Object

Describes a single header for HTTP response headers and for individual parts in `multipart` representations (see Response Object and Encoding Object for restrictions).

Structure follows the Parameter Object (schema or content), with these differences:

- **name** MUST NOT be specified; it is the key in the containing `headers` map.
- **in** MUST NOT be specified; implicitly `header`.
- **allowEmptyValue** MUST NOT be used.
- **style** if used MUST be `"simple"` only (default for headers).

## Common fields (with schema or content)

| Field        | Type   | Description |
|-------------|--------|-------------|
| description | string | Brief description; CommonMark allowed. |
| required    | boolean | Default false. |
| deprecated  | boolean | Default false. |
| example, examples | Any / Map | Mutually exclusive; see Working with Examples. |

## With schema

| Field   | Type   | Description |
|--------|--------|-------------|
| style   | string | Only legal value: `"simple"`. |
| explode | boolean | For array/object: comma-separated in single header; default false. |
| schema  | Schema Object | Type for the header. |

When serializing headers with schema, URI percent-encoding MUST NOT be applied; pass values through unchanged (see Appendix D).

## With content

| Field   | Type   | Description |
|--------|--------|-------------|
| content | Map[string, Media Type \| Reference] | **One** entry: media type → representation. |

## Special cases

- **Link header:** Use `application/linkset` or `application/linkset+json` in Media Type Object; schema describes links per RFC9264.
- **Set-Cookie:** Exception to multi-value header rules (RFC9110); use one value per line in examples; no header name or `:` in example value. Use `content` or `style: simple` with `explode: true` for schema per cookie.

## Example

```yaml
headers:
  X-Rate-Limit-Limit:
    description: Allowed requests in current period
    schema:
      type: integer
  X-Rate-Limit-Remaining:
    description: Remaining requests
    schema:
      type: integer
  ETag:
    required: true
    schema:
      type: string
      pattern: ^"
    example: '"xyzzy"'
```

<!--
Source references:
- https://github.com/OAI/OpenAPI-Specification/blob/main/versions/3.2.0.md
-->
