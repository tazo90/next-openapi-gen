---
name: core-discriminator-and-xml
description: Discriminator Object and XML Object in OpenAPI 3.2
---

# Discriminator Object

Provides a hint for which schema in an `oneOf`, `anyOf`, or (for non-validation use) `allOf` applies. Does **not** change validation outcome. Used to improve serialization/deserialization and error messaging.

Legal only with composite keywords: `oneOf`, `anyOf`, `allOf`. With `oneOf`/`anyOf`, all possible schemas MUST be listed explicitly. With `allOf`, discriminator can be on parent; children built via `allOf` are alternatives; validation with parent does not search child schemas.

## Fixed fields

| Field         | Type   | Description |
|--------------|--------|-------------|
| propertyName | string | **REQUIRED**. Name of property in payload holding the discriminating value. |
| mapping      | Map[string, string] | Payload value → schema name or URI. |
| defaultMapping | string | Schema name or URI when property is absent or value has no explicit/implicit mapping. **REQUIRED** if discriminating property is optional. |

Value of `propertyName` maps to schema name in Components unless `mapping` overrides. Mapping keys are strings; tooling MAY convert response values to string for comparison (implementation-defined). For ambiguous value like `"foo"` as URI, prefix with `"."` (e.g. `"./foo"`).

## Example (oneOf)

```yaml
MyResponseType:
  oneOf:
    - $ref: '#/components/schemas/Cat'
    - $ref: '#/components/schemas/Dog'
    - $ref: '#/components/schemas/Lizard'
  discriminator:
    propertyName: petType
```

Payload `{"id": 1, "petType": "Cat"}` hints Cat schema.

## Example (mapping + optional property)

```yaml
discriminator:
  propertyName: petType
  mapping:
    dog: '#/components/schemas/Dog'
    monster: https://example.com/schemas/Monster.json
  defaultMapping: OtherPet
```

# XML Object

Metadata for XML representation of a Schema. Used inside Schema Object.

## Fixed fields

| Field     | Type   | Description |
|----------|--------|-------------|
| nodeType | string | `element`, `attribute`, `text`, `cdata`, or `none`. Default: `none` if `$ref`/`$dynamicRef`/`type: "array"` in same schema; else `element`. |
| name     | string | Element/attribute name; overrides inferred name. Ignored if nodeType is text, cdata, or none. |
| namespace | string | IRI for namespace (non-relative). |
| prefix   | string | Prefix for name. |
| attribute | boolean | (Deprecated.) Use `nodeType: "attribute"`. |
| wrapped  | boolean | (Deprecated.) For array: wrapped vs unwrapped. Use `nodeType: "element"`. |

Inferred names: component name for root schemas; property name for properties/array items; otherwise no inference — `name` MUST be set. For arrays, default nodeType `none` (unwrapped); set `nodeType: "element"` for wrapped list.

## Key points

- Discriminator: optional property requires `defaultMapping`; subschemas with mapped values should require the discriminator property.
- XML: use `nodeType` instead of deprecated `attribute`/`wrapped`; `none` for schema-only structure (e.g. `$ref` only).

<!--
Source references:
- https://github.com/OAI/OpenAPI-Specification/blob/main/versions/3.2.0.md
-->
