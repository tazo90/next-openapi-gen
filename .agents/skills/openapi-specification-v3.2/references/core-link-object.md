---
name: core-link-object
description: Link Object and runtime expressions in OpenAPI 3.2
---

# Link Object

Represents a design-time link from a response to another operation. Presence does not guarantee the caller can invoke it; provides a known relationship. Unlike dynamic links in the response payload, OAS links do not require link info in the runtime response. Parameters for the linked operation are computed via **runtime expressions**.

## Fixed fields

| Field        | Type   | Description |
|-------------|--------|-------------|
| operationRef | string | URI reference to an Operation Object. Mutually exclusive with `operationId`. Relative refs MAY locate operation in OAD. |
| operationId  | string | Name of existing resolvable operation (unique `operationId`). Mutually exclusive with `operationRef`. Prefer `operationRef` in multi-document OADs. |
| parameters   | Map[string, Any \| expression] | Parameter name (optionally qualified, e.g. `path.id`) → constant or runtime expression. |
| requestBody  | Any \| expression | Literal or expression for request body when calling target operation. |
| description  | string | Description; CommonMark allowed. |
| server       | Server Object | Server for the target operation. |

Exactly one of `operationRef` or `operationId` MUST be present. Linked operation MUST be unique; from Path Item referenced multiple times, resolution may be implementation-defined or error.

## Runtime expressions

Syntax: `$url` | `$method` | `$statusCode` | `$request.source` | `$response.source` where source is `header.token` | `query.name` | `path.name` | `body` or `body#/json-pointer`.

| Example                  | Notes |
|--------------------------|-------|
| `$method`                | HTTP method. |
| `$request.header.accept` | Request header (token case-insensitive). |
| `$request.path.id`      | Path parameter; must be declared on operation. |
| `$request.body#/user/uuid` | Request body or fragment (JSON Pointer). |
| `$response.body#/status` | Response body or fragment. |
| `$response.header.Location` | Single header value. |

Expressions preserve type. Embed in strings with `{expression}`.

## Example (operationId)

```yaml
paths:
  /users/{id}:
    get:
      responses:
        '200':
          content:
            application/json:
              schema:
                type: object
                properties:
                  uuid: { type: string, format: uuid }
          links:
            address:
              operationId: getUserAddress
              parameters:
                userid: $request.path.id
  /users/{userid}/address:
    get:
      operationId: getUserAddress
      responses:
        '200':
          description: user's address
```

## Example (operationRef)

```yaml
links:
  UserRepositories:
    operationRef: '#/paths/~12.0~1repositories~1%7Busername%7D/get'
    parameters:
      username: $response.body#/username
```

Use `~1` for `/` and `%7B`/`%7D` for `{`/`}` in JSON Pointer in fragments.

<!--
Source references:
- https://github.com/OAI/OpenAPI-Specification/blob/main/versions/3.2.0.md
-->
