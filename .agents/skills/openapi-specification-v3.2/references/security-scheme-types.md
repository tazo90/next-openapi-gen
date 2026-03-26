---
name: security-scheme-types
description: Security scheme types (apiKey, http, mutualTLS, oauth2, openIdConnect) in OpenAPI 3.2
---

# Security Scheme Types

[Security Scheme Object](security.md) `type` determines which fields apply. All types support `description` and `deprecated`.

## apiKey

API key in header, query, or cookie. **Required:** `type`, `name`, `in`.

| Field | Type   | Description |
|-------|--------|-------------|
| name  | string | **REQUIRED**. Header/query/cookie parameter name (e.g. `X-API-Key`, `api_key`). |
| in    | string | **REQUIRED**. `"query"`, `"header"`, or `"cookie"`. |

```yaml
type: apiKey
name: X-API-Key
in: header
description: API key in header
```

## http

HTTP authentication (e.g. Basic, Bearer). **Required:** `type`, `scheme`.

| Field       | Type   | Applies To | Description |
|------------|--------|------------|-------------|
| scheme     | string | **REQUIRED**. IANA Auth Scheme (e.g. `basic`, `bearer`); case-insensitive. |
| bearerFormat | string | http (bearer) | Hint for token format (e.g. JWT). |

**Basic:**

```yaml
type: http
scheme: basic
description: HTTP Basic auth
```

**Bearer JWT:**

```yaml
type: http
scheme: bearer
bearerFormat: JWT
```

## mutualTLS

Client certificate (TLS). Only `type` and optional `description`.

```yaml
type: mutualTLS
description: Cert must be signed by example.com CA
```

## oauth2

OAuth2 flows. **Required:** `type`, `flows`. Optional: `oauth2MetadataUrl` (RFC8414 metadata URL; TLS required). See [security-oauth2-flows](security-oauth2-flows.md).

```yaml
type: oauth2
flows:
  authorizationCode:
    authorizationUrl: https://example.com/oauth/dialog
    tokenUrl: https://example.com/oauth/token
    scopes:
      write:pets: modify pets
      read:pets: read pets
```

## openIdConnect

OpenID Connect Discovery. **Required:** `type`, `openIdConnectUrl` (well-known URL).

```yaml
type: openIdConnect
openIdConnectUrl: https://example.com/.well-known/openid-configuration
```

## Security Requirement (applying schemes)

- **apiKey, http, mutualTLS:** Use **empty array** `[]` (or role names if used by tooling).
- **oauth2, openIdConnect:** Use **list of scope names** required for execution (e.g. `[write:pets, read:pets]`); list MAY be empty.

```yaml
security:
  - api_key: []
  - petstore_auth: [write:pets, read:pets]
```

## Key points

- **basic** and **bearer** are `type: http` with `scheme: basic` or `scheme: bearer`.
- Prefer Authorization Code with PKCE over implicit flow; avoid basic for sensitive data.
- Declare schemes in `components.securitySchemes`; reference by name or URI in Security Requirement.

<!--
Source references:
- https://github.com/OAI/OpenAPI-Specification/blob/main/versions/3.2.0.md
-->
