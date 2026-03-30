---
name: core-reference-object
description: Reference Object and $ref resolution in OpenAPI 3.2
---

# Reference Object

Allows referencing other components in the OAD internally or externally. Used where a component type is expected (e.g. Response, Parameter, Schema).

## Fixed fields

| Field       | Type   | Description |
|------------|--------|-------------|
| $ref       | string | **REQUIRED**. Reference identifier; MUST be a URI. |
| summary    | string | Short summary; by default SHOULD override referenced component's summary (if that type allows summary). |
| description | string | By default SHOULD override referenced component's description (if that type allows description); CommonMark allowed. |

No additional properties; any added SHALL be ignored. Differs from a Schema Object that contains a `$ref` keyword (which may have other JSON Schema keywords).

## Resolution

- Resolve per [Relative References in API Description URIs](https://github.com/OAI/OpenAPI-Specification/blob/main/versions/3.2.0.md) (base URI from `$self` or retrieval URI; fragments as JSON Pointer per RFC6901).
- When `$self` is present, use document's `$self` URI for interoperability; other URIs (e.g. retrieval URI) may be implementation-defined.
- Implementations MUST NOT treat a reference as unresolvable before fully parsing all OAD documents.

## Examples

```yaml
# Internal (same document)
$ref: '#/components/schemas/Pet'

# Relative file
$ref: Pet.yaml

# Relative document with fragment
$ref: definitions.yaml#/Pet

# With overrides
$ref: '#/components/schemas/Pet'
summary: A pet entity
description: Override the component description here.
```

## Key points

- Reference Object is the **only** way to add `summary`/`description` override when referencing; the referenced object type must support those fields for override to apply.
- Schema Object may contain JSON Schema `$ref` keyword; that is in-schema referencing, not the OpenAPI Reference Object.

<!--
Source references:
- https://github.com/OAI/OpenAPI-Specification/blob/main/versions/3.2.0.md
-->
