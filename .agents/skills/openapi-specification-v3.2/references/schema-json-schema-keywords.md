---
name: schema-json-schema-keywords
description: JSON Schema 2020-12 keywords and OAS extensions in Schema Object for OpenAPI 3.2
---

# Schema Object — JSON Schema Keywords and OAS Extensions

The [Schema Object](schema-and-components.md) is a **superset** of [JSON Schema Specification Draft 2020-12](https://www.ietf.org/archive/id/draft-bhutton-json-schema-01.html). Empty schema = `true`; schema that allows no instance = `false`. OAS dialect URI: `https://spec.openapis.org/oas/3.1/dialect/base`.

## JSON Schema keywords (used in OAS)

Same meaning as in JSON Schema unless stated:

- **$ref**, **$id**, **$anchor**, **$dynamicAnchor**, **$dynamicRef** — References and identifiers (URIs).
- **$schema** — Dialect; default from root `jsonSchemaDialect`.
- **type** — "null", "boolean", "object", "array", "number", "string", "integer".
- **format** — See [Data Type Formats](core-data-types-and-formats.md); OAS adds int32, int64, float, double, password.
- **title**, **description** — OAS extends description with CommonMark.
- **default**, **examples** — examples is array (JSON Schema 2020-12); OAS deprecates singular `example`.
- **enum**, **const**
- **multipleOf**, **maximum**, **exclusiveMaximum**, **minimum**, **exclusiveMinimum**
- **maxLength**, **minLength**, **pattern**
- **maxItems**, **minItems**, **uniqueItems**, **items**, **prefixItems**, **additionalItems**
- **maxProperties**, **minProperties**, **required**, **properties**, **additionalProperties**, **patternProperties**
- **allOf**, **oneOf**, **anyOf**, **not**
- **if**, **then**, **else**, **dependentSchemas**, **dependentRequired**
- **contentEncoding**, **contentMediaType**, **contentSchema** — For string-encoded content (e.g. binary, JSON in string).
- **$comment** — Annotation only.

## OAS-specific Schema fields

| Field        | Type    | Description |
|-------------|---------|-------------|
| discriminator | [Discriminator Object](core-discriminator-and-xml.md) | Hint for which schema in oneOf/anyOf/allOf applies. |
| xml          | [XML Object](core-discriminator-and-xml.md) | XML representation. |
| externalDocs | External Documentation Object | Additional docs. |
| example      | Any     | **Deprecated.** Use JSON Schema `examples` array. |

Schema Object MAY be extended with Specification Extensions (x-); additional properties MAY omit x- prefix in this object.

## Key points

- Schema can describe **primitives**, **arrays**, and **objects** (type + format, type: array + items/prefixItems, type: object + properties).
- Use **allOf** for composition; **oneOf**/**anyOf** for polymorphism; **discriminator** as hint (see [schema-composition-polymorphism](schema-composition-polymorphism.md)).
- For binary/string-encoded content use **contentEncoding** and **contentMediaType** (not format for content-encoding in 3.1+).

<!--
Source references:
- https://github.com/OAI/OpenAPI-Specification/blob/main/versions/3.2.0.md
-->
