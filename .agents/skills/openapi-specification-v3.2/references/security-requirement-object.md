---
name: security-requirement-object
description: Security Requirement Object for applying security to API or operations in OpenAPI 3.2
---

# Security Requirement Object

Declares which **security schemes** are required to execute the API (at root) or an operation (per operation). Used in root `security` and in [Operation Object](paths-and-operations.md) `security`.

## Structure

**Patterned fields only:** Each key MUST be the name of a security scheme in [components.securitySchemes](schema-and-components.md) or a URI reference to a Security Scheme Object. Component name takes precedence over URI when identical (for compatibility with prior OAS); using a component name that looks like a URI is NOT RECOMMENDED. To reference with a single-segment relative URI that collides with a component name, use `.` path segment (e.g. `./foo`).

**Value:**

- **oauth2, openIdConnect:** Array of **scope names** required for execution (e.g. `["write:pets", "read:pets"]`). Array MAY be empty.
- **apiKey, http, mutualTLS:** Array MAY contain role names (not defined or exchanged in-band); typically empty `[]`.

## Logic

- **Root or operation `security`:** The value is an **array** of Security Requirement objects.
  - **Between array entries: OR** — only one of the Security Requirement objects need be satisfied to authorize the request.
  - **Within one entry (multiple keys): AND** — all listed schemes must be satisfied.
- **Operation** overrides root. Use `security: []` on an operation to clear root security (no auth required for that operation).
- **Empty object `{}`** in the array: indicates anonymous access is supported (optional security). To make security explicitly optional, include `{}` in the array.

## Examples

**API-wide: API key OR OAuth2 with scopes:**

```yaml
security:
  - api_key: []
  - petstore_auth: [write:pets, read:pets]
```

**Operation requires both API key and OAuth2 (AND):**

```yaml
security:
  - api_key: []
    petstore_auth: [read:pets]
```

**Optional security (anonymous or OAuth2):**

```yaml
security:
  - {}
  - petstore_auth: [write:pets, read:pets]
```

**Operation clears security:**

```yaml
security: []
```

## Key points

- Scheme names must match components.securitySchemes keys (or be a URI to a Security Scheme).
- OAuth2/openIdConnect value = list of scope names; apiKey/http/mutualTLS typically `[]`.
- OR between array elements; AND between keys in one element. `{}` = optional (anonymous allowed).

<!--
Source references:
- https://github.com/OAI/OpenAPI-Specification/blob/main/versions/3.2.0.md
-->
