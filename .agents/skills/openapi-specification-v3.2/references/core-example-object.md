---
name: core-example-object
description: Example Object and Working with Examples in OpenAPI 3.2
---

# Example Object

Groups an internal or external example with `summary` and `description`. Used in `examples` (plural) in Media Type, Parameter, and Header Objects. Referenceable alternative to singular `example` fields.

## Fixed fields

| Field         | Type   | Description |
|---------------|--------|-------------|
| summary       | string | Short description. |
| description   | string | Long description; CommonMark allowed. |
| dataValue     | Any    | Data structure valid per Schema; if present, `value` MUST be absent. |
| serializedValue | string | Serialized form (encoding/escaping per Validating Examples). If `dataValue` present, SHOULD be its serialization. If present, `value` and `externalValue` MUST be absent. Prefer not for JSON (data form easier). |
| externalValue | string | URI to serialized example in separate document. If present, `serializedValue` and `value` MUST be absent. |
| value         | Any    | Embedded literal. Mutually exclusive with `externalValue`. **Deprecated for non-JSON targets:** use `dataValue` and/or `serializedValue`. |

Example SHOULD be compatible with associated schema; tooling MAY validate and reject.

## Working with examples

- **Parameter / Header / Media Type:** use `examples` (plural) for Example Objects; `example` (singular) is shorthand for one Example with only `value`; mutually exclusive with `examples`.
- **Schema:** JSON Schema `examples` (array) or deprecated `example` (singular).

### When to use which field

**To show data as validated by Schema:**

- Schema `examples` array (JSON Schema 2020-12), or Example Object `dataValue`.
- Use Schema `example` or Example `value` only for OAS 3.0/3.1 compatibility when value is naturally JSON/YAML.

**To show serialized form (for HTTP message):**

- Example Object `serializedValue` when serialization is a valid Unicode string.
- Example Object `externalValue` for other values or external files.
- Use `value` string only for OAS 3.1 compatibility.

`serializedValue` and `externalValue` MUST show the serialized form (with Encoding Object effects for Media Type; for Parameter/Header with schema+style see Style Examples).

## Example (JSON)

```yaml
examples:
  noRating:
    summary: A not-yet-rated work
    dataValue:
      author: A. Writer
      title: The Newest Book
  withRating:
    summary: A work with rating 4.5
    dataValue:
      author: A. Writer
      title: An Older Book
      rating: 4.5
    serializedValue: |
      {"author":"A. Writer","title":"An Older Book","rating":4.5}
```

## Example (boolean query parameter)

```yaml
name: flag
in: query
required: true
schema:
  type: boolean
examples:
  "true":
    dataValue: true
    serializedValue: flag=true
  "false":
    dataValue: false
    serializedValue: flag=false
```

<!--
Source references:
- https://github.com/OAI/OpenAPI-Specification/blob/main/versions/3.2.0.md
-->
