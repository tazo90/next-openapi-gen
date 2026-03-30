---
name: core-tags-and-external-docs
description: Tag Object and External Documentation Object in OpenAPI 3.2
---

# Tag Object

Adds metadata to a tag used by Operation Object. Not mandatory to have a Tag Object for every tag used in operations.

| Field       | Type   | Description |
|------------|--------|-------------|
| name       | string | **REQUIRED**. Tag name; use in Operation's `tags` array. |
| summary    | string | Short summary for display. |
| description | string | Description; CommonMark allowed. |
| externalDocs | External Documentation Object | Additional external documentation. |
| parent     | string | `name` of a tag this tag is nested under; named tag MUST exist; no circular parent/child. |
| kind       | string | Machine-readable category (e.g. `nav`, `badge`, `audience`); registry at spec.openapis.org. |

## Example

```yaml
tags:
  - name: account-updates
    summary: Account Updates
    description: Account update operations
    kind: nav
  - name: partner
    summary: Partner
    description: Operations available to partners
    parent: external
    kind: audience
  - name: external
    summary: External
    description: Operations available to external consumers
    kind: audience
```

# External Documentation Object

References an external resource for extended documentation.

| Field       | Type   | Description |
|------------|--------|-------------|
| description | string | Description of target; CommonMark allowed. |
| url        | string | **REQUIRED**. URI for the target (MUST be URI). |

## Example

```yaml
externalDocs:
  description: Find more info here
  url: https://example.com
```

<!--
Source references:
- https://github.com/OAI/OpenAPI-Specification/blob/main/versions/3.2.0.md
-->
