---
name: core-data-types-and-formats
description: Data types and format keyword in OpenAPI 3.2 (JSON Schema)
---

# Data Types and Formats

In OpenAPI 3.2, data types follow [JSON Schema Validation Draft 2020-12](https://www.ietf.org/archive/id/draft-bhutton-json-schema-validation-01.html): **"null"**, **"boolean"**, **"object"**, **"array"**, **"number"**, **"string"**, **"integer"**.

- Keywords and `format` operate on JSON instances (six JSON types). Many keywords apply only to a specific type (e.g. `pattern` to string, `minimum` to number) and do **not** require that type — use `type` to constrain.
- **integer** is a convenience type; JSON has no separate integer type; `1` and `1.0` are equivalent for validation.

## Format keyword

Optional modifier on types; per JSON Schema, `format` is typically **non-validating** (annotation); validation behavior is implementation-defined.

OAS-defined formats (examples):

| format   | JSON type | Comments |
|----------|-----------|----------|
| int32    | number    | Signed 32-bit. |
| int64    | number    | Signed 64-bit (long). |
| float    | number    | |
| double   | number    | |
| password | string    | Hint to obscure value. |

Full set and JSON data type per format: see [Format Registry](https://spec.openapis.org/registry/format/). For binary/string encoding in 3.1+, JSON Schema's `contentEncoding` and `contentMediaType` are used (not `format` for content-encoding).

## OAS Schema dialect

Schema Object is a superset of JSON Schema Draft 2020-12. OAS dialect URI: `https://spec.openapis.org/oas/3.1/dialect/base`. Default for document: root `jsonSchemaDialect`. OAS extends `description` (CommonMark) and `format`; supports discriminator, xml, externalDocs, deprecated example.

## Key points

- Always use `type` when you need a specific type; other keywords do not imply it.
- For binary or non-JSON serialization, use Schema `contentEncoding` / `contentMediaType` where applicable (see Working with Binary Data in spec).

<!--
Source references:
- https://github.com/OAI/OpenAPI-Specification/blob/main/versions/3.2.0.md
-->
