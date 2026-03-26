---
name: core-server
description: Server Object and Server Variable in OpenAPI 3.2
---

# Server Object

Represents a server. Used for connectivity information.

## Server Object — Fixed Fields

| Field        | Type   | Description |
|-------------|--------|-------------|
| url         | string | **REQUIRED**. Target host URL; supports Server Variables in `{braces}`. Query and fragment MUST NOT be used. May be relative. |
| description | string | Optional description of the host; CommonMark allowed. |
| name       | string | Optional unique string for the host. |
| variables   | Map[string, Server Variable Object] | Variable name → value for substitution in url. |

## API URLs vs document URIs

- Fields that are **API URLs** (e.g. server `url`) are resolved using Server Object URLs as base, not the OAD document base URI. Relative server URLs MAY be relative to the referring document.
- `$self` identifies the OpenAPI document and is ignored when resolving API base URLs (e.g. retrieval URI is used for API URL resolution when server url is relative).

## Server Variable Object

| Field        | Type   | Description |
|-------------|--------|-------------|
| enum        | [string] | If present, substitution values from this set; array MUST NOT be empty. |
| default     | string | **REQUIRED**. Default for substitution; MUST be in enum if enum is defined. |
| description | string | Optional; CommonMark allowed. |

Each variable MUST NOT appear more than once in the server URL template.

## Example

```yaml
servers:
  - url: https://{username}.gigantic-server.com:{port}/{basePath}
    description: The production API server
    name: prod
    variables:
      username:
        default: demo
        description: User-specific subdomain.
      port:
        enum: ['8443', '443']
        default: '8443'
      basePath:
        default: v2
```

## Key points

- Path is **appended** to the resolved server URL (no relative URL resolution for path).
- Server URL templating follows RFC6570-style syntax; variable names use `{name}`.

<!--
Source references:
- https://github.com/OAI/OpenAPI-Specification/blob/main/versions/3.2.0.md
-->
