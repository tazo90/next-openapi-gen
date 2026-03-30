# Zod 4 Support Matrix

This document tracks the Zod 4 surface that `next-openapi-gen` currently validates in code and fixtures.

The generator uses static AST analysis rather than the Zod runtime, so support is best described in terms of emitted OpenAPI shapes and tested source patterns.

## Verified Coverage

| Zod 4 construct                                            | Expected emitted shape                                               | OpenAPI targets     | Regression coverage                                                                                                                                   | Notes                                               |
| ---------------------------------------------------------- | -------------------------------------------------------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `z.email()`                                                | `type: "string", format: "email"`                                    | `3.0`, `3.1`, `3.2` | `tests/unit/schema/zod/zod-converter.test.ts`, `tests/integration/generator/zod4-support.test.ts`                                                     | Same parity as `z.string().email()`                 |
| `z.url()`                                                  | `type: "string", format: "uri"`                                      | `3.0`, `3.1`, `3.2` | `tests/unit/schema/zod/zod-converter.test.ts`, `tests/integration/generator/zod4-support.test.ts`                                                     | Same parity as `z.string().url()`                   |
| `z.uuid()`                                                 | `type: "string", format: "uuid"`                                     | `3.0`, `3.1`, `3.2` | `tests/unit/schema/zod/zod-converter.test.ts`, `tests/integration/generator/zod4-support.test.ts`                                                     | Closes issue `#92`                                  |
| `z.iso.datetime()`                                         | `type: "string", format: "date-time"`                                | `3.0`, `3.1`, `3.2` | `tests/unit/schema/zod/zod-converter.test.ts`, `tests/integration/generator/zod4-support.test.ts`                                                     | Nested namespace helper support                     |
| `nullable()` / `nullish()` on supported base schemas       | `nullable: true` in `3.0`; `type: [..., "null"]` in `3.1+`           | `3.0`, `3.1`, `3.2` | `tests/integration/generator/zod4-support.test.ts`, `tests/integration/validation/openapi-validation.test.ts`                                         | Version finalization rewrites nullable semantics    |
| `pipe()` into a stronger schema                            | Preserves strongest representable base schema                        | `3.0`, `3.1`, `3.2` | `tests/unit/schema/zod/zod-converter.test.ts`                                                                                                         | Used for patterns like `z.string().pipe(z.email())` |
| `transform()` / `refine()` / `superRefine()` / `brand()`   | Preserve the underlying JSON-schema-compatible base shape            | `3.0`, `3.1`, `3.2` | `tests/unit/schema/zod/zod-converter.test.ts`, `tests/integration/generator/zod4-support.test.ts`                                                     | Runtime-only semantics are not serialized           |
| Shared imported query schemas                              | Per-parameter schemas retain `$ref` / `allOf` detail                 | `3.0`, `3.1`, `3.2` | `tests/unit/schema/typescript/schema-content.test.ts`, `tests/integration/generator/zod4-support.test.ts`                                             | Closes issue `#93`                                  |
| Required fields in `@queryParams` object schemas           | Per-parameter `required: true` matches parent schema `required` list | `3.0`, `3.1`, `3.2` | `tests/unit/schema/typescript/schema-content.test.ts`, `tests/integration/generator/zod4-support.test.ts`                                             | Closes issue `#94`                                  |
| Exported `z.infer<typeof Schema>` aliases in pure-Zod mode | No duplicate component unless alias is explicitly referenced         | `3.0`, `3.1`, `3.2` | `tests/unit/schema/zod/zod-converter.test.ts`, `tests/integration/generator/zod4-support.test.ts`                                                     | Closes issue `#96`                                  |
| `import { z } from "zod/v4"`                               | Parsed the same as `zod` import path when the local binding is `z`   | `3.0`, `3.1`, `3.2` | `tests/unit/schema/zod/zod-converter.test.ts`, `tests/integration/generator/zod4-support.test.ts`, `tests/integration/generator/zod4-support.test.ts` | Also covered in a Pages Router fixture              |

## Checked-In Fixtures

| Fixture                                                     | Purpose                                                                                                                            |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `tests/fixtures/projects/next/app-router/zod-only-coverage` | App Router Zod-first coverage for top-level helpers, transformed query params, nullable helper output, and pure-Zod alias behavior |
| `tests/fixtures/projects/next/pages-router/zod-flow`        | Pages Router coverage for `zod/v4` imports and Zod-generated response schemas                                                      |

## Known Boundaries

- The generator preserves the strongest OpenAPI-representable base schema for transforms and refinements, but it does not serialize arbitrary runtime predicates.
- `@auth` metadata currently emits alternative security requirements for comma-separated values. Combined requirements and advanced scheme fields should still be modeled in templates or reusable OpenAPI fragments.
- Response inference is selective and best-effort. It supports named response types, inline object responses, multiple return paths, and `204` responses, but explicit `@response` tags remain the most deterministic option when stable component names matter.
