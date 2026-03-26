---
name: core-info-metadata
description: Info, Contact, and License objects in OpenAPI 3.2
---

# Info and Metadata

## Info Object

Provides metadata about the API. Used by clients and documentation tools.

| Field           | Type   | Required | Description |
|-----------------|--------|----------|-------------|
| title           | string | **REQUIRED** | Title of the API. |
| summary         | string | No       | Short summary. |
| description     | string | No       | Description; CommonMark allowed. |
| termsOfService  | string | No       | URI for Terms of Service. |
| contact         | Contact Object | No | Contact for the API. |
| license         | License Object | No | License for the API. |
| version         | string | **REQUIRED** | Version of the OpenAPI document (distinct from OAS version or API version). |

## Contact Object

| Field | Type   | Description |
|-------|--------|-------------|
| name  | string | Contact person/organization name. |
| url   | string | URI for contact (MUST be URI). |
| email | string | Email (MUST be email format). |

## License Object

| Field      | Type   | Description |
|------------|--------|-------------|
| name       | string | **REQUIRED**. License name. |
| identifier | string | SPDX license expression; mutually exclusive with `url`. |
| url        | string | URI for license; mutually exclusive with `identifier`. |

## Example

```yaml
info:
  title: Example Pet Store App
  summary: A pet store manager.
  description: This is an example server for a pet store.
  termsOfService: https://example.com/terms/
  contact:
    name: API Support
    url: https://www.example.com/support
    email: support@example.com
  license:
    name: Apache 2.0
    identifier: Apache-2.0
  version: 1.0.1
```

<!--
Source references:
- https://github.com/OAI/OpenAPI-Specification/blob/main/versions/3.2.0.md
-->
