# OpenAPI Version Coverage

This document describes how `next-openapi-gen` supports OpenAPI `3.0`, `3.1`, `3.2`, and experimental `3.3-preview`.

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
- TypeScript checker support is used selectively for App Router response inference and path-alias/module resolution. The checker runs through the project-installed TypeScript compiler when available, uses TypeScript 7's native API when exposed, and otherwise falls back to the bundled TypeScript 6 compatibility API while supporting consumer TypeScript `>=5.9 <8`.
- Zod schemas still default to AST conversion, but selected Zod 4 constructs can use a runtime-assisted export path so request and response variants diverge only when the emitted schemas actually differ.

## Choosing a version

- **OpenAPI 3.0**: safest default when downstream tooling compatibility matters more than newer schema and document features.
- **OpenAPI 3.1**: best when you want JSON Schema 2020-12-aligned output such as type-array nullability, numeric exclusives, and `jsonSchemaDialect`.
- **OpenAPI 3.2**: best when you want richer route metadata such as `querystring`, enhanced tags, sequential media, and richer example objects.
- **`3.3-preview`**: experimental 3.2-compatible preview. Set `openapi` to `3.3-preview` (or `3.3.0-preview`). It is not a released OpenAPI 3.3 document. Unreleased `3.3.0` and OpenAPI `4.x` fall back to `3.2`.

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

| Feature                                                           | Status                                      | Notes                                                                                                                                                                                                          |
| ----------------------------------------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Enhanced tags (`summary`, `kind`, `parent`)                       | `generated`, `template/custom`, `validated` | Route JSDoc metadata and template/custom tags are preserved for 3.2 and stripped for older targets.                                                                                                            |
| `querystring` parameters                                          | `generated`, `template/custom`, `validated` | Route JSDoc metadata can emit `querystring` parameters directly; older targets downgrade them to `query`.                                                                                                      |
| Sequential media (`itemSchema`, `itemEncoding`, `prefixEncoding`) | `generated`, `template/custom`, `validated` | Route JSDoc metadata or template fragments can emit sequential media; older targets backport the 3.2-only fields onto `x-oai-*` extensions.                                                                    |
| Example Object `dataValue` / `serializedValue` / `externalValue`  | `generated`, `template/custom`, `validated` | Route examples and template/custom examples preserve 3.2 example fields and downgrade older targets where needed.                                                                                              |
| Discriminator `defaultMapping`                                    | `template/custom`, `validated`              | Preserved through the shared document model.                                                                                                                                                                   |
| `server.name` and root `$self`                                    | `template/custom`, `validated`              | Preserved for 3.2 and backported to `x-oai-name` / `x-oai-$self` for older versions.                                                                                                                           |
| `additionalOperations` / HTTP `QUERY`                             | `generated`, `template/custom`, `validated` | `@method QUERY` emits the OpenAPI 3.2 Path Item `query` field; `additionalOperations` is only used for methods without a fixed Path Item field. Older targets backport both onto `x-oai-additionalOperations`. |
| `oauth2MetadataUrl` and OAuth `deviceAuthorization` flow          | `template/custom`, `validated`              | Preserved for 3.2; `deviceAuthorization` backports to `x-oai-deviceAuthorization`, while `oauth2MetadataUrl` is stripped for older versions.                                                                   |

## First-Class Route Features

| Feature                 | Source                                                                                      | Notes                                                                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Examples                | `@examples`                                                                                 | Supports inline values, serialized payloads, external URLs, and exported typed references for request, response, and querystring examples. |
| Structured tag metadata | `@tag`, `@tagSummary`, `@tagKind`, `@tagParent`                                             | Tag metadata is synthesized into root `tags` entries.                                                                                      |
| `querystring`           | `@querystring FilterSchema as advancedQuery`                                                | Emits an OpenAPI 3.2 `querystring` parameter with form content.                                                                            |
| HTTP `QUERY`            | `@method QUERY`                                                                             | Emits the operation under the Path Item `query` field for OpenAPI 3.2 output.                                                              |
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

## OAI registries

Format, Tag Kind, Media Type, Extension, and Namespace snapshots live in
`packages/openapi-core/src/openapi/registries/` (snapshot date **2026-08-13**).
Generation maps Zod string formats onto registered `format` values when one
exists, prefers `contentEncoding` / `contentMediaType` over deprecated
`binary` / `byte`, and backports 3.2-only fields onto registered `x-oai-*` /
`x-jsonschema-*` extensions instead of dropping them.

Unknown `@tagKind` values are allowed (the Tag Kind registry is not closed) and
emit an `unregistered-tag-kind` info diagnostic. Unregistered Zod formats emit
`unregistered-format` and keep a `pattern` when one is known.

OpenAPI 3.3 is not a released generated version. Use `3.3-preview` for the
experimental 3.2-compatible selector. Unreleased `3.3.0` and OpenAPI `4.x`
fall back to `3.2`, the latest released target. Security scheme `type` stays an
open string, cookie parameters are isolated, and Overlay/Arazzo share the
JSONPath subset used for later security-profile pointers.

## Companion specifications

Arazzo and Overlay are optional config-gated sibling packages. They are not
OpenAPI versions and do not add JSDoc tags.

- [Arazzo workflows](./arazzo.md)
- [OpenAPI Overlay](./overlay.md)
