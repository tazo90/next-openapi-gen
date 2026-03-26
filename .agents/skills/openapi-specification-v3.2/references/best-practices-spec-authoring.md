---
name: best-practices-spec-authoring
description: Practical authoring practices for OpenAPI 3.2 specs
---

# Best Practices (Spec Authoring)

## operationId

- **Use a unique operationId for every operation.** Many tools use it for method names and client generation.
- Prefer a clear, stable name (e.g. `getPetById`, `createOrder`). Avoid changing it across versions.
- Case-sensitive; RECOMMENDED to follow common programming naming conventions.

## Tags

- Use **tags** to group operations (e.g. by resource or feature). Declare tags at root with [Tag Object](core-tags-and-external-docs.md) (`name`, `summary`, `description`, `externalDocs`, `parent`, `kind`) for UI order and docs.
- Keep tag names short and consistent; operations can list multiple tags.

## $self and multi-document OADs

- Set **$self** to a stable URI for this document when using multi-document OADs or when the document may be relocated. Use it as base URI for reference resolution; implementations MUST support resolving API description URIs using it when present.
- Prefer `operationRef` over `operationId` in [Link Object](core-link-object.md) for multi-document OADs to avoid name clashes.

## Responses

- **Document at least one success response** (e.g. 200 or 201). The spec says operations SHOULD document success.
- Use **default** for unexpected or unspecified status codes (e.g. generic error schema).
- Reuse common responses via `components.responses` and `$ref` (e.g. 404, 500, 400). See [components-reuse](components-reuse.md).

## Parameters

- **Path parameters:** Always set `required: true`; name must match the path template segment.
- **Uniqueness:** (name, in) must be unique per operation; path-level and operation-level parameters merge, with operation overriding (cannot remove path params).
- Reuse common parameters (pagination, API key, etc.) via `components.parameters` and `$ref`.

## Summary and description

- **summary:** Short line for UI; keep concise.
- **description:** Use for behavior, constraints, and examples; CommonMark is supported (minimum CommonMark 0.27).

## Schemas and components

- Put reusable models under **components.schemas** and reference with `$ref: '#/components/schemas/Name'`.
- For polymorphism use **discriminator** on the base schema with `oneOf`/`anyOf`/`allOf`; use Component names or URIs for mapping.
- Reuse parameters, responses, request bodies, headers, examples, security schemes, links, callbacks, path items, media types via Components.

## Security

- Declare schemes in **components.securitySchemes**; apply at root (`security`) and/or per operation. Use `security: []` on an operation to clear root security; use `{}` in the array to make security optional.
- OAuth2/openIdConnect: list required **scopes** in the Security Requirement Object; for apiKey/http/mutualTLS use empty array or role names (not defined in-band).
- Prefer Authorization Code with PKCE over implicit flow; avoid basic auth for sensitive data.

## Key points

- Prefer reuse (components) to keep the spec maintainable and consistent.
- Use operationId + tags + $self (when needed) + clear responses so codegen and docs stay predictable.

<!--
Source references:
- https://github.com/OAI/OpenAPI-Specification/blob/main/versions/3.2.0.md
-->
