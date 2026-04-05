# OpenAPI Version Coverage

This document describes how `next-openapi-gen` supports OpenAPI `3.0`, `3.1`, and `3.2`.

Feature status uses three buckets:

- `generated`: emitted directly from route metadata, TypeScript types, or Zod schemas
- `template/custom`: preserved from `next.openapi.json` or `schemaFiles`
- `validated`: covered by version-aware tests and schema validation

## Shared Strategy

- Route discovery, diagnostics, schema lookup, response-set expansion, and component merging are shared across all versions.
- Version-specific behavior is applied at the finalization layer.
- OpenAPI `3.2` builds on the `3.1` schema model because `3.2` is backward-compatible with `3.1`.
- The root `openapi` field is the only version selector; `next-openapi-gen` derives the internal target version from that string.
- Explicit `@response` metadata wins over inferred responses.
- Comma-separated `@auth` metadata emits alternative security requirements, one scheme per entry. Richer `securitySchemes` modeling still comes from templates or custom OpenAPI fragments.
- TypeScript checker support is used selectively for App Router response inference and path-alias/module resolution.
- Zod schemas still default to AST conversion, but selected Zod 4 constructs can use a runtime-assisted export path so request and response variants diverge only when the emitted schemas actually differ.

## Choosing a version

- **OpenAPI 3.0**: safest default when downstream tooling compatibility matters more than newer schema and document features.
- **OpenAPI 3.1**: best when you want JSON Schema 2020-12-aligned output such as type-array nullability, numeric exclusives, and `jsonSchemaDialect`.
- **OpenAPI 3.2**: best when you want richer route metadata such as `querystring`, enhanced tags, sequential media, and richer example objects.

## OpenAPI 3.0 Baseline

| Area                                                                                                                                            | Status                                      | Notes                                                                                                                      |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Root document fields valid for the target version (`info`, `servers`, `security`, `tags`, `externalDocs`, `paths`, etc.)                        | `template/custom`, `validated`              | Generator preserves version-valid template fields instead of dropping them during finalization.                            |
| Components (`schemas`, `responses`, `parameters`, `requestBodies`, `headers`, `examples`, `links`, `callbacks`, `pathItems`, `securitySchemes`) | `generated`, `template/custom`, `validated` | Generated coverage remains strongest for `schemas`, `responses`, and operation-level parameter/request/response objects.   |
| Parameters (`path`, `query`, `header`, `cookie`) with schema/content                                                                            | `generated`, `template/custom`, `validated` | Generated parameters now preserve richer schema fields instead of only `type/enum/description`.                            |
| Request/response media objects                                                                                                                  | `generated`, `template/custom`, `validated` | Inline and referenced bodies are preserved and normalized per target version.                                              |
| Error response components and security requirements                                                                                             | `generated`, `template/custom`, `validated` | Route metadata generates operation security requirements; richer scheme objects are preserved from templates/custom files. |
| Links, callbacks, reusable examples, path items                                                                                                 | `template/custom`, `validated`              | Preserved from templates and custom schema files.                                                                          |
| App Router response inference                                                                                                                   | `generated`, `validated`                    | Typed `NextResponse.json(...)` / `Response.json(...)` responses can be inferred when `@response` is absent.                |

## OpenAPI 3.1 Additions

| Feature                                          | Status                         | Notes                                                                    |
| ------------------------------------------------ | ------------------------------ | ------------------------------------------------------------------------ |
| JSON Schema 2020-12-aligned schema normalization | `generated`, `validated`       | Shared schemas are upgraded during finalization.                         |
| `nullable` -> type arrays / null unions          | `generated`, `validated`       | Generated `3.1` output no longer leaves `3.0`-style `nullable` in place. |
| Numeric `exclusiveMinimum` / `exclusiveMaximum`  | `generated`, `validated`       | Converted between 3.0 and 3.1 forms.                                     |
| Schema `example` -> `examples`                   | `generated`, `validated`       | Applied at schema finalization time.                                     |
| `contentEncoding` / `contentMediaType`           | `generated`, `validated`       | Upgraded from older `format`-based binary/base64 forms where possible.   |
| `jsonSchemaDialect` / `$schema`                  | `template/custom`, `validated` | Preserved when authored in templates or custom fragments.                |

## OpenAPI 3.2 Additions

| Feature                                                           | Status                                      | Notes                                                                                                             |
| ----------------------------------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Enhanced tags (`summary`, `kind`, `parent`)                       | `generated`, `template/custom`, `validated` | Route JSDoc metadata and template/custom tags are preserved for 3.2 and stripped for older targets.               |
| `querystring` parameters                                          | `generated`, `template/custom`, `validated` | Route JSDoc metadata can emit `querystring` parameters directly; older targets downgrade them to `query`.         |
| Sequential media (`itemSchema`, `itemEncoding`, `prefixEncoding`) | `generated`, `template/custom`, `validated` | Route JSDoc metadata or template fragments can emit sequential media; older targets remove the 3.2-only fields.   |
| Example Object `dataValue` / `serializedValue` / `externalValue`  | `generated`, `template/custom`, `validated` | Route examples and template/custom examples preserve 3.2 example fields and downgrade older targets where needed. |
| Discriminator `defaultMapping`                                    | `template/custom`, `validated`              | Preserved through the shared document model.                                                                      |
| `server.name` and root `$self`                                    | `template/custom`, `validated`              | Preserved for 3.2 and removed for older versions.                                                                 |
| `oauth2MetadataUrl` and OAuth `deviceAuthorization` flow          | `template/custom`, `validated`              | Preserved for 3.2 and stripped for older versions.                                                                |

## First-Class Route Features

| Feature                 | Source                                                                                      | Notes                                                                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Examples                | `@examples`                                                                                 | Supports inline values, serialized payloads, external URLs, and exported typed references for request, response, and querystring examples. |
| Structured tag metadata | `@tag`, `@tagSummary`, `@tagKind`, `@tagParent`                                             | Tag metadata is synthesized into root `tags` entries.                                                                                      |
| `querystring`           | `@querystring FilterSchema as advancedQuery`                                                | Emits an OpenAPI 3.2 `querystring` parameter with form content.                                                                            |
| Sequential media        | `@responseContentType`, `@responseItem`, `@responseItemEncoding`, `@responsePrefixEncoding` | Emits 3.2 media objects for streaming or record-oriented responses.                                                                        |

## Checker-Assisted Improvements

- App Router response inference can reuse named schemas when the checker resolves the response type.
- Inline object returns still emit a best-effort inline schema instead of silently dropping the response.
- Multiple return paths and explicit `204` responses are collected when they can be statically identified from `Response.json(...)` / `NextResponse.json(...)` returns.
- `tsconfig.json` path aliases are resolved for TypeScript schema discovery when imports are not purely relative.
- TypeScript schema resolution can now fall back to the checker for mapped, conditional, template-literal, `keyof`, and import-based named types when Babel-only analysis would otherwise collapse them to broad objects.
- This checker support is intentionally selective; the generator does not require a full-project type-check-only architecture.

## Testing Strategy

- Unit tests cover version adapter transforms, new JSDoc tags, checker-assisted response inference, and TypeScript path-alias resolution.
- Integration tests cover generated schema differences between `3.0` and `3.1`, version-specific template metadata passthrough, and first-class 3.2 route annotations and inference behavior.
- Validation tests run generated `3.0`, `3.1`, and `3.2` specs through `@seriousme/openapi-schema-validator`, including a Zod-heavy fixture that exercises top-level Zod 4 helpers, transformed query params, and pure-Zod alias behavior.
- Template/custom-fragment tests verify that advanced reusable OpenAPI objects survive generation without being dropped.
