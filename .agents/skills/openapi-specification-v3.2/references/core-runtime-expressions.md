---
name: core-runtime-expressions
description: Runtime expressions for Link and Callback in OpenAPI 3.2
---

# Runtime Expressions

Runtime expressions allow defining values based on information available only at runtime within the HTTP message. Used by [Link Object](core-link-object.md) (parameters, requestBody) and [Callback Object](callbacks-and-webhooks.md) (callback URL key).

## Syntax (ABNF, simplified)

- **expression** = `$url` | `$method` | `$statusCode` | `$request.source` | `$response.source`
- **source** = header-reference | query-reference | path-reference | body-reference
- **header-reference** = `header.` token
- **query-reference** = `query.` name
- **path-reference** = `path.` name
- **body-reference** = `body` [ `#` json-pointer ]

`name` is case-sensitive; `token` (header name) is case-insensitive per HTTP. JSON Pointer is per RFC6901 (`/` for path, `~1` for `/`, `~0` for `~` in tokens).

Expressions preserve the type of the referenced value. Embed in string values by surrounding with `{}`, e.g. `http://example.com?userId={$request.path.id}`.

## Example expressions

| Source | Example expression | Notes |
|--------|--------------------|-------|
| HTTP Method | `$method` | POST, GET, etc. |
| Request URL | `$url` | Full request URL |
| Request header | `$request.header.content-type` | Single header value |
| Request path param | `$request.path.id` | Path param must be declared on operation |
| Request query param | `$request.query.queryUrl` | Query param must be declared |
| Request body | `$request.body#/user/uuid` | JSON Pointer into request body |
| Response header | `$response.header.Location` | Single header value |
| Response body | `$response.body#/status` | JSON Pointer into response body |
| Status code | `$statusCode` | HTTP status code |

## Usage in Link Object

Parameters and requestBody can be constants or runtime expressions. Example: pass request path id to linked operation:

```yaml
links:
  address:
    operationId: getUserAddress
    parameters:
      userid: $request.path.id
```

## Usage in Callback Object

Callback key is a runtime expression that evaluates to the callback URL. Example: use query param as callback URL:

```yaml
callbacks:
  myCallback:
    '{$request.query.queryUrl}':
      post:
        requestBody: { ... }
        responses:
          '200':
            description: callback processed
```

## Key points

- Request parameters/headers used in expressions MUST be declared in the operation (or path).
- When an expression fails to evaluate, no parameter value is passed to the target (Link).
- For Callback, the key expression is evaluated in the context of the request/response to identify the URL for the callback request.

<!--
Source references:
- https://github.com/OAI/OpenAPI-Specification/blob/main/versions/3.2.0.md
-->
