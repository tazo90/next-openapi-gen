---
name: security-oauth2-flows
description: OAuth2 flows and OAuth Flow Object in OpenAPI 3.2
---

# OAuth2 Flows

Security Scheme with `type: oauth2` uses an **OAuth Flows Object** to configure supported flows: implicit, password, clientCredentials, authorizationCode, deviceAuthorization (RFC8628). OAuth2 implicit flow is deprecated; prefer **Authorization Code with PKCE**.

## OAuth Flows Object

| Field               | Type   | Description |
|---------------------|--------|-------------|
| implicit            | OAuth Flow Object | Implicit flow (deprecated). |
| password            | OAuth Flow Object | Resource Owner Password. |
| clientCredentials   | OAuth Flow Object | Client Credentials (was `application` in 2.0). |
| authorizationCode  | OAuth Flow Object | Authorization Code (was `accessCode` in 2.0). |
| deviceAuthorization | OAuth Flow Object | Device Authorization flow. |

## OAuth Flow Object

| Field                 | Type   | Applies To | Description |
|-----------------------|--------|------------|-------------|
| authorizationUrl      | string | implicit, authorizationCode | **REQUIRED**. MUST be URL; TLS. |
| deviceAuthorizationUrl | string | deviceAuthorization | **REQUIRED**. MUST be URL; TLS. |
| tokenUrl              | string | password, clientCredentials, authorizationCode, deviceAuthorization | **REQUIRED**. MUST be URL; TLS. |
| refreshUrl            | string | oauth2    | URL for refresh tokens. |
| scopes                | Map[string, string] | oauth2 | **REQUIRED**. Scope name → short description; MAY be empty. |

Optional: **oauth2MetadataUrl** on Security Scheme — URL to OAuth2 authorization server metadata (RFC8414); TLS required.

## Examples

**Implicit (deprecated):**

```yaml
type: oauth2
flows:
  implicit:
    authorizationUrl: https://example.com/api/oauth/dialog
    scopes:
      write:pets: modify pets
      read:pets: read pets
```

**Authorization Code (recommended):**

```yaml
type: oauth2
flows:
  authorizationCode:
    authorizationUrl: https://example.com/api/oauth/dialog
    tokenUrl: https://example.com/api/oauth/token
    scopes:
      write:pets: modify pets
      read:pets: read pets
```

**Multiple flows:**

```yaml
type: oauth2
flows:
  implicit:
    authorizationUrl: https://example.com/api/oauth/dialog
    scopes:
      write:pets: modify pets
      read:pets: read pets
  authorizationCode:
    authorizationUrl: https://example.com/api/oauth/dialog
    tokenUrl: https://example.com/api/oauth/token
    scopes:
      write:pets: modify pets
      read:pets: read pets
```

## Security Requirement (OAuth2)

For oauth2/openIdConnect, value is list of scope names required; list MAY be empty:

```yaml
security:
  - petstore_auth:
      - write:pets
      - read:pets
```

## Key points

- Use Authorization Code (and PKCE) for new APIs; avoid implicit for sensitive data.
- All OAuth2 URLs MUST use TLS. Use `oauth2MetadataUrl` when server supports RFC8414 metadata.

<!--
Source references:
- https://github.com/OAI/OpenAPI-Specification/blob/main/versions/3.2.0.md
-->
