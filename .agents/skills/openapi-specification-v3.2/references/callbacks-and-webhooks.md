---
name: callbacks-and-webhooks
description: Callback Object and webhooks in OpenAPI 3.2
---

# Callbacks and Webhooks

## Callback Object

Map of out-of-band callbacks related to the parent operation. Key = **runtime expression** that evaluates to the callback URL; value = Path Item Object describing the request and expected responses.

- Use when the API provider will call back the client (e.g. after subscription); URL may come from request/response (e.g. `$request.query.queryUrl`, `$request.body#/successUrls/1`).
- Runtime expressions can reference `$url`, `$method`, `$request.path.*`, `$request.query.*`, `$request.header.*`, `$request.body#/...`, `$response.header.*`, etc. (see spec for full list).

### Example

```yaml
callbacks:
  myCallback:
    '{$request.query.queryUrl}':
      post:
        requestBody:
          description: Callback payload
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/SomePayload'
        responses:
          '200':
            description: callback successfully processed
```

## Webhooks (root)

Root field `webhooks`: Map[string, Path Item Object]. Describes **incoming** requests that the API consumer MAY implement, initiated by the API provider (e.g. out-of-band registration). Key = unique name; value = Path Item for the request and expected responses.

- Differs from callbacks: callbacks are tied to an operation and URL from that operation; webhooks are top-level and describe inbound events independent of a specific API call.

## Key points

- Callback key is a runtime expression; value is a Path Item (same structure as paths).
- Webhooks are for provider-initiated inbound requests; document under `webhooks` at root.

<!--
Source references:
- https://github.com/OAI/OpenAPI-Specification/blob/main/versions/3.2.0.md
-->
