---
name: advanced-security-filtering
description: Security filtering and empty Paths/Path Item in OpenAPI 3.2
---

# Security Filtering

Some objects in the OpenAPI Specification MAY be **empty** or **removed** for access control over the documentation. This is **not** part of the specification itself; it is a pattern that some libraries use to restrict what viewers see based on authentication/authorization.

## Empty Paths Object

The [Paths Object](paths-and-operations.md) MAY be **present but empty** (no path keys). This can indicate:

- The viewer reached the right place but is not allowed to see any paths.
- They still have access to the [Info Object](core-info-metadata.md), which may contain instructions (e.g. how to authenticate to see full docs).

## Empty Path Item Object

A path key may exist but the [Path Item Object](paths-and-operations.md) MAY be **empty** (no get, put, post, parameters, etc.). This can indicate:

- The path exists, but the viewer cannot see operations or parameters for it.
- Finer control than hiding the path entirely: the user knows the path exists but not what they can call.

## Security Considerations (spec summary)

- **OpenAPI Description formats:** OADs use JSON, YAML, and JSON Schema; share their security considerations (see spec for links).
- **Tooling and usage:** OADs are processed by many tools (codegen, docs, routing, testing); authors must consider risks of each scenario.
- **Security schemes:** OAD describes security schemes; selection should match sensitivity and impact. Some schemes (e.g. basic auth, OAuth implicit) are supported for compatibility but not endorsed for highly sensitive data.
- **External resources:** OADs may reference external resources that tools dereference automatically; external hosts may be untrusted.
- **Reference cycles:** References may cause cycles; tooling must detect and handle them to avoid resource exhaustion.
- **Markdown/HTML:** Certain fields allow Markdown (including HTML/script); tooling must sanitize appropriately.

## Key points

- Empty Paths or Path Item is valid per the spec (Paths can be empty; Path Item can have no method keys).
- Use this pattern only when your tooling supports it for documentation access control.
- Not enforced by the spec; it is an optional implementation pattern.

<!--
Source references:
- https://github.com/OAI/OpenAPI-Specification/blob/main/versions/3.2.0.md
-->
