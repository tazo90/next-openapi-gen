---
name: security
description: Security Scheme, OAuth Flows, and Security Requirement in OpenAPI 3.2
---

# Security

## Security Scheme Object

Defines a security scheme usable by operations. Supported: HTTP auth, API key (header/query/cookie), mutual TLS, OAuth2 (implicit, password, client credentials, authorization code, device authorization [RFC8628]), OpenID Connect Discovery.

**Note:** OAuth2 implicit flow is deprecated; prefer Authorization Code with PKCE.

| Field             | Type   | Applies To | Description |
|------------------|--------|------------|-------------|
| type              | string | **REQUIRED** | `"apiKey"`, `"http"`, `"mutualTLS"`, `"oauth2"`, `"openIdConnect"`. |
| description       | string | Any       | CommonMark allowed. |
| name              | string | apiKey    | **REQUIRED**. Header, query, or cookie parameter name. |
| in                | string | apiKey    | **REQUIRED**. `"query"`, `"header"`, or `"cookie"`. |
| scheme            | string | http      | **REQUIRED**. HTTP Auth scheme name (e.g. Authorization header); case-insensitive. |
| bearerFormat      | string | http (bearer) | Hint for bearer token format (e.g. JWT). |
| flows             | OAuth Flows Object | oauth2 | **REQUIRED**. Flow configuration. |
| openIdConnectUrl  | string | openIdConnect | **REQUIRED**. Well-known URL for OpenID Connect Discovery. |
| oauth2MetadataUrl | string | oauth2   | OAuth2 authorization server metadata URL [RFC8414]; TLS required. |
| deprecated        | boolean | Any      | Default false. |

## OAuth Flows Object

| Field               | Type   | Description |
|---------------------|--------|-------------|
| implicit            | OAuth Flow Object | Implicit flow. |
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

## Security Requirement Object

Lists security schemes required to execute the operation. Each property name MUST match a security scheme in Components or be a URI to a Security Scheme. Component name takes precedence over URI when identical.

- **Multiple schemes in one object:** all MUST be satisfied (e.g. multiple headers/query params).
- **Multiple Security Requirement Objects (at root or operation):** only one need be satisfied (OR).
- **Empty object `{}`:** anonymous access allowed.

Patterned field: `{name}` → array of scope names (oauth2/openIdConnect) or role names (other types); array MAY be empty.

## Examples

```yaml
# API Key
type: apiKey
name: api-key
in: header

# HTTP Bearer JWT
type: http
scheme: bearer
bearerFormat: JWT

# OAuth2 Authorization Code
type: oauth2
flows:
  authorizationCode:
    authorizationUrl: https://example.com/oauth/dialog
    tokenUrl: https://example.com/oauth/token
    scopes:
      write:pets: modify pets
      read:pets: read pets
```

```yaml
# Optional security (anonymous or OAuth2)
security:
  - {}
  - petstore_auth: [write:pets, read:pets]
```

## Key points

- Root `security` is OR; operation overrides; use `[]` to remove root security.
- Do not rely on implicit flow or basic auth for sensitive data; use Authorization Code + PKCE or stronger.

<!--
Source references:
- https://github.com/OAI/OpenAPI-Specification/blob/main/versions/3.2.0.md
-->
