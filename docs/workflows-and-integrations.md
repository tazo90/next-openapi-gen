# Workflows And Integrations

This guide focuses on the common ways teams adopt `next-openapi-gen` in real
projects, from framework integration to schema migration and downstream OpenAPI
usage.

## Choose the integration that matches your app

The CLI works everywhere. Add a framework-specific integration when you want
generation to happen as part of local dev or build hooks.

- `CLI only`: best for explicit generation in scripts, CI, or ad hoc local
  runs. Use `openapi-gen generate` or `openapi-gen generate --watch`.
- `next-openapi-gen/next`: best for Next.js-specific build integration.
  `createNextOpenApiAdapter()` generates on build completion.
- `next-openapi-gen/vite`: best for TanStack Router and other Vite-based
  workflows. It generates on build start and watches during dev unless
  `watch: false`.
- `next-openapi-gen/react-router`: best for React Router projects that want a
  framework-specific plugin import. It uses the React Router framework adapters
  directly.

### Next.js

Use the CLI-only flow when you want the least magic. Add the Next adapter when
you want generation attached to the build lifecycle.

Adapter file example:

```js
import { createNextOpenApiAdapter } from "next-openapi-gen/next";

export default createNextOpenApiAdapter();
```

`withNextOpenApi()` wires the Next build to an internal `next-openapi-gen`
adapter automatically. Use it when you want adapter behavior from
`next.config.*` without committing a separate adapter file.

### TanStack Router

The public Vite entrypoint is the standard integration path:

```ts
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { createViteOpenApiPlugin } from "next-openapi-gen/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tanstackStart(), createViteOpenApiPlugin(), react()],
});
```

This works well when you want automatic regeneration during local development
without adding a separate watch script.

### React Router

React Router has its own public entrypoint:

```ts
import react from "@vitejs/plugin-react";
import { createReactRouterOpenApiPlugin } from "next-openapi-gen/react-router";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [createReactRouterOpenApiPlugin(), react()],
});
```

If your React Router app already standardizes on the shared Vite integration
surface, the checked-in example app shows that path too.

### Route scanning only vs framework hooks

Prefer CLI-only generation when:

- you want a simple `generate` step in CI
- your team prefers explicit regeneration over build hooks
- you commit generated specs and want easy diffs

Prefer plugin or adapter integration when:

- you want the spec refreshed automatically during local development
- you want generation tied to build events
- your framework already centralizes automation in `next.config.*` or `vite.config.*`

## Choose the workflow that matches your codebase

### Zod-first projects

Use this when your route contracts already live in exported Zod schemas.

Best for:

- schema-first teams using Zod for validation
- projects that want rich field descriptions close to code
- teams that already export schemas from `src/schemas`

Current Zod-first behavior is hybrid:

- most exported schemas are still converted through AST analysis
- selected Zod 4 features such as `coerce`, `pipe`, `templateLiteral`, `stringbool`, and static `.meta(...)` payloads can use a runtime-assisted export path
- request and response components stay shared unless the runtime-assisted path proves that their emitted shapes differ

### TypeScript-first projects

Use this when your codebase already has exported request and response types, but
does not yet rely on Zod everywhere.

Best for:

- existing APIs with stable TypeScript DTOs
- teams that want generated docs without a validation rewrite
- incremental documentation adoption

### Mixed-schema migrations

Use this when your project sits between both worlds.

A typical configuration is:

```json
{
  "schemaType": ["zod", "typescript"],
  "schemaDir": "./src/schemas",
  "schemaFiles": ["./schemas/external-api.yaml"]
}
```

This is useful for:

- gradual TypeScript-to-Zod migrations
- combining app-owned schemas with externally produced OpenAPI fragments
- large codebases where different domains evolved differently

Resolution priority is:

1. `schemaFiles`
2. `zod`
3. `typescript`

See [../apps/next-app-mixed-schemas](../apps/next-app-mixed-schemas) for a
runnable example.

## Reusable OpenAPI fragments

`schemaFiles` lets you merge hand-authored YAML or JSON into the generated
document. This is useful when part of your contract is easier to express in
plain OpenAPI than in route-level annotations.

Common uses:

- reusable `components.schemas`
- shared `responses`
- custom `parameters`
- `securitySchemes`
- pre-authored `tags`
- advanced reusable `paths` or `webhooks`

Use fragments when you need richer OpenAPI objects without moving your whole
workflow away from code-first generation.

## Drizzle and drizzle-zod

`next-openapi-gen` works well with schemas created by `drizzle-zod`, which helps
you keep database structure, validation, and generated docs aligned.

Example:

```ts
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { posts } from "@/db/schema";

export const CreatePostSchema = createInsertSchema(posts, {
  title: (schema) => schema.title.min(5).max(255),
  content: (schema) => schema.content.min(10),
});

export const PostResponseSchema = createSelectSchema(posts);
```

This pattern is especially useful when:

- you already treat the database schema as the source of truth
- you want CRUD docs with minimal duplicate modeling
- you need a clean path from database table to API docs

See [../apps/next-app-drizzle-zod](../apps/next-app-drizzle-zod) for the full
example.

## Next.js router choices

Both Next.js routing models are supported.

### App Router

Best when:

- you want checker-assisted response inference
- your APIs already live in `app/api`
- you are using modern Next.js route handlers

### Pages Router

Best when:

- you have an existing legacy Next.js API surface
- you want documentation before a larger router migration
- you are incrementally modernizing the project

For Pages Router, remember to set `routerType` to `"pages"` and add `@method`
tags to handlers.

## Using the generated spec downstream

Because the output is standard OpenAPI, you can feed the generated document into
other tools in your delivery pipeline.

Common examples include:

- interactive docs portals
- API client generators
- SDK generation workflows
- contract validation and schema checks in CI
- gateways or platforms that import OpenAPI specs

If a tool accepts a standard OpenAPI file, it can usually consume the generated
`openapi.json`.

## Keeping docs current in development and CI

Two common patterns work well:

### Local development

- run `openapi-gen generate --watch` when you want an explicit watcher
- review `/api-docs` alongside your feature work
- prefer the framework plugin or adapter when you want watch behavior attached
  to the dev server

### CI

- generate the spec during validation
- fail the build if generation breaks
- optionally compare the generated output when the spec is committed as an
  artifact
- prefer the explicit CLI command in CI even if local development uses a plugin

The repository itself backs this quality story with lint, build, unit,
integration, coverage, and E2E workflows. See
[openapi-version-coverage](./openapi-version-coverage.md) for the validation
story and [../.github/workflows/ci.yml](../.github/workflows/ci.yml) for the CI
pipeline.

## Recommended example apps

Choose an example app based on your use case:

- [../apps/next-app-zod](../apps/next-app-zod) for a Zod-first starting point
- [../apps/next-app-typescript](../apps/next-app-typescript) for a
  TypeScript-only workflow
- [../apps/next-app-mixed-schemas](../apps/next-app-mixed-schemas) for a
  migration story
- [../apps/next-app-drizzle-zod](../apps/next-app-drizzle-zod) for a
  database-backed example
- [../apps/next-app-sandbox](../apps/next-app-sandbox) for edge-case route and
  exclusion coverage
- [../apps/next-pages-router](../apps/next-pages-router) for legacy router
  support
- [../apps/tanstack-app](../apps/tanstack-app) for TanStack Router parity
- [../apps/react-router-app](../apps/react-router-app) for React Router parity
- [../apps/next-app-next-config](../apps/next-app-next-config),
  [../apps/next-app-ts-config](../apps/next-app-ts-config), and
  [../apps/next-app-adapter](../apps/next-app-adapter) for config and adapter
  integration paths

For the broader coverage map that shows what each example is meant to prove, see
[example-app-coverage-plan](./example-app-coverage-plan.md).

## Related guides

- [Getting started and configuration](./getting-started.md)
- [JSDoc reference](./jsdoc-reference.md)
- [FAQ and troubleshooting](./faq.md)
