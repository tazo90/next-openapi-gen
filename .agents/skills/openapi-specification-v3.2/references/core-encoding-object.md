---
name: core-encoding-object
description: Encoding Object for form and multipart in OpenAPI 3.2
---

# Encoding Object

A single encoding definition applied to a single value. Mapping of Encoding Objects to values is determined by the [Media Type Object](request-body-and-media-type.md) (encoding by name or by position).

## When it applies

- **Encoding by name (`encoding`):** For media types structured as name-value pairs with repeat values: `application/x-www-form-urlencoded`, `multipart/form-data`. Keys map to schema property names (or array items for array properties).
- **Encoding by position (`prefixEncoding`, `itemEncoding`):** For `multipart` (e.g. `multipart/mixed`): array schema; `prefixEncoding` = array of Encoding Objects per position; `itemEncoding` = one Encoding for remaining items (supports streaming).

## Common fixed fields

| Field         | Type   | Description |
|--------------|--------|-------------|
| contentType  | string | Comma-separated; specific or wildcard (e.g. `image/*`). Defaults by type: no type / string+contentEncoding → `application/octet-stream`; string no contentEncoding → `text/plain`; number/integer/boolean → `text/plain`; object/array → `application/json`. |
| headers      | Map[string, Header \| Reference] | For multipart only; Content-Type ignored here. |
| encoding, prefixEncoding, itemEncoding | Map / [Encoding] / Encoding | Nested encoding (e.g. nested multipart). |

## RFC6570-style serialization (form / multipart/form-data only)

| Field         | Type   | Description |
|--------------|--------|-------------|
| style        | string | Same as Parameter; default `"form"` when contentType not used due to explode/allowReserved. |
| explode     | boolean | For array/object: separate params per value/pair. form default true; others false. |
| allowReserved | boolean | Reserved expansion (RFC6570); default false. |

When using RFC6570-style for `multipart/form-data`, URI percent-encoding MUST NOT be applied; `allowReserved` has no effect.

## Default contentType (by type)

| type / context   | contentEncoding | Default contentType    |
|------------------|-----------------|------------------------|
| (absent)         | n/a             | application/octet-stream |
| string           | present         | application/octet-stream |
| string           | absent          | text/plain             |
| number/integer/boolean | n/a       | text/plain             |
| object           | n/a             | application/json       |
| array            | n/a             | application/json      |

## Examples

**x-www-form-urlencoded with encoding:**

```yaml
requestBody:
  content:
    application/x-www-form-urlencoded:
      schema:
        type: object
        properties:
          id: { type: string, format: uuid }
          address: { type: object, properties: {} }
      encoding:
        address:
          contentType: application/json
```

**multipart/form-data with encoding:**

```yaml
requestBody:
  content:
    multipart/form-data:
      schema:
        type: object
        properties:
          id: { type: string, format: uuid }
          profileImage: {}
      encoding:
        profileImage:
          contentType: image/png, image/jpeg
          headers:
            X-Rate-Limit-Limit:
              description: Allowed requests
              schema: { type: integer }
```

## Key points

- `encoding` keys MUST exist as schema properties; by-name only for form-like media types.
- For multipart by position use `prefixEncoding` / `itemEncoding` with array schema or `itemSchema`; `itemEncoding` supports streaming.

<!--
Source references:
- https://github.com/OAI/OpenAPI-Specification/blob/main/versions/3.2.0.md
-->
