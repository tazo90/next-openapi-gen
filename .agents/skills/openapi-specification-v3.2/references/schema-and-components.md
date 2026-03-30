---
name: schema-and-components
description: Schema Object (JSON Schema 2020-12), Components, and Reference in OpenAPI 3.2
---

# Schema and Components

## Schema Object

Superset of [JSON Schema Specification Draft 2020-12](https://www.ietf.org/archive/id/draft-bhutton-json-schema-01.html). Empty schema (any instance valid) MAY be `true`; schema that allows no instance MAY be `false`.

- OAS dialect requires OAS base vocabulary plus JSON Schema 2020-12 meta-schema. Dialect URI: `https://spec.openapis.org/oas/3.1/dialect/base`.
- Extended by OAS: `description` (CommonMark), `format` (see Data Type Formats), plus OAS base vocabulary keywords.
- Supports `discriminator`, `xml`, `externalDocs`, and deprecated `example` (prefer JSON Schema `examples`).

## Data types

Types follow JSON Schema Validation Draft 2020-12: "null", "boolean", "object", "array", "number", "string", "integer". Use `type` to constrain; keywords like `pattern`/`minimum` do not imply type.

OAS-defined formats (examples): `int32`, `int64`, `float`, `double`, `password` (string). See spec and Format Registry for full list.

## Components Object

Reusable objects. Keys MUST match `^[a-zA-Z0-9\.\-_]+$`. No effect on API until referenced from outside Components.

| Field           | Type   | Description |
|-----------------|--------|-------------|
| schemas         | Map[string, Schema] | Reusable Schema Objects. |
| responses       | Map[string, Response \| Reference] | Reusable Response Objects. |
| parameters      | Map[string, Parameter \| Reference] | Reusable Parameter Objects. |
| examples        | Map[string, Example \| Reference] | Reusable Example Objects. |
| requestBodies   | Map[string, Request Body \| Reference] | Reusable Request Body Objects. |
| headers         | Map[string, Header \| Reference] | Reusable Header Objects. |
| securitySchemes | Map[string, Security Scheme \| Reference] | Reusable Security Scheme Objects. |
| links           | Map[string, Link \| Reference] | Reusable Link Objects. |
| callbacks       | Map[string, Callback \| Reference] | Reusable Callback Objects. |
| pathItems       | Map[string, Path Item] | Reusable Path Item Objects. |
| mediaTypes      | Map[string, Media Type \| Reference] | Reusable Media Type Objects. |

## Reference Object

| Field       | Type   | Description |
|------------|--------|-------------|
| $ref       | string | **REQUIRED**. URI identifying the target. |
| summary    | string | Overrides referenced component summary (if that type allows summary). |
| description | string | Overrides referenced component description (if that type allows description). |

No additional properties; any added SHALL be ignored. Differs from Schema Object containing a `$ref` keyword (which may have other keywords).

## Example (components)

```yaml
components:
  schemas:
    GeneralError:
      type: object
      properties:
        code: { type: integer, format: int32 }
        message: { type: string }
    Category:
      type: object
      properties:
        id: { type: integer, format: int64 }
        name: { type: string }
  parameters:
    skipParam:
      name: skip
      in: query
      required: true
      schema: { type: integer, format: int32 }
  responses:
    NotFound:
      description: Entity not found.
```

## Key points

- Schema is JSON Schema 2020-12 dialect; use `$schema` or document-level `jsonSchemaDialect` for default.
- Reference resolution: use document `$self` when present for interoperability.
- Components are referenced by URI (e.g. `#/components/schemas/Pet` or relative `Pet.yaml`).

<!--
Source references:
- https://github.com/OAI/OpenAPI-Specification/blob/main/versions/3.2.0.md
-->
