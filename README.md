# next-openapi-gen

[![npm version](https://img.shields.io/npm/v/next-openapi-gen)](https://www.npmjs.com/package/next-openapi-gen)
[![CI](https://github.com/tazo90/next-openapi-gen/actions/workflows/ci.yml/badge.svg)](https://github.com/tazo90/next-openapi-gen/actions/workflows/ci.yml)
[![License](https://img.shields.io/github/license/tazo90/next-openapi-gen)](https://github.com/tazo90/next-openapi-gen)

Generate OpenAPI `3.0`, `3.1`, and `3.2` from your Next.js routes using the schemas you already have.

`next-openapi-gen` scans App Router and Pages Router handlers, reads JSDoc metadata, and generates an OpenAPI spec plus an optional docs UI. It is built for real Next.js codebases that use Zod, TypeScript, drizzle-zod, or reusable OpenAPI fragments, including mixed-schema migrations.

[Quick start](#quick-start) • [Docs index](./docs/README.md) • [Example apps](#example-apps) • [Validation and coverage](#validation-and-coverage)

## Why teams use it

- Keep OpenAPI close to your handlers instead of maintaining a separate manual spec.
- Reuse existing `zod`, `typescript`, `drizzle-zod`, and YAML/JSON OpenAPI fragments in one pipeline.
- Target `3.0`, `3.1`, or `3.2` from the same route metadata with version-aware finalization.
- Ship interactive docs quickly with built-in UI scaffolding for Scalar, Swagger, Redoc, Stoplight Elements, or RapiDoc.
- Fall back on checker-assisted App Router response inference when explicit `@response` tags are missing.

## Quick start

### Requirements

- Node.js `>=24`
- A Next.js project using App Router or Pages Router

### Install

```bash
pnpm add -D next-openapi-gen
```

```bash
npm install --save-dev next-openapi-gen
```

```bash
yarn add --dev next-openapi-gen
```

### Initialize and generate

```bash
# Creates next.openapi.json and a docs page (Scalar by default)
pnpm exec next-openapi-gen init

# Scans your routes and writes the spec
pnpm exec next-openapi-gen generate
```

> [!TIP]
> Use `--ui none` during `init` if you only want the generated OpenAPI file.

Need the full setup flow, config walkthrough, or production notes? See
[docs/getting-started.md](./docs/getting-started.md).

### What you get

- `next.openapi.json` in your project root
- `public/openapi.json` by default
- `/api-docs` with your selected UI provider

## Minimal example

```ts
import { NextRequest } from "next/server";
import { z } from "zod";

export const ProductParams = z.object({
  id: z.string().describe("Product ID"),
});

export const ProductResponse = z.object({
  id: z.string(),
  name: z.string(),
  price: z.number().positive(),
});

/**
 * Get product information
 * @description Fetch a product by ID
 * @pathParams ProductParams
 * @response ProductResponse
 * @openapi
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  return Response.json({ id: params.id, name: "Keyboard", price: 99 });
}
```

## Why `next-openapi-gen` is different

| Capability                            | Why it matters                                                                                        |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Next.js-first route scanning          | Designed for App Router and legacy Pages Router instead of generic controller conventions.            |
| Mixed schema sources                  | Combine `zod`, `typescript`, `schemaFiles`, and drizzle-zod-backed schemas during gradual migrations. |
| OpenAPI `3.0` / `3.1` / `3.2` targets | Keep one authoring flow while emitting version-aware output for newer spec features.                  |
| Response inference                    | Infer typed App Router responses when `@response` is omitted, while still letting explicit tags win.  |
| Docs UI scaffolding                   | Generate a docs page fast instead of stopping at a JSON file.                                         |

## Common workflows

### Start with Zod or TypeScript

Use one schema system if your app is already consistent:

```json
{
  "schemaType": "zod",
  "schemaDir": "src/schemas"
}
```

### Migrate gradually with mixed schema sources

Use multiple schema types in the same project when you are moving from TypeScript to Zod or merging generated and hand-authored schemas:

```json
{
  "schemaType": ["zod", "typescript"],
  "schemaDir": "./src/schemas",
  "schemaFiles": ["./schemas/external-api.yaml"]
}
```

Resolution priority is:

1. `schemaFiles`
2. `zod`
3. `typescript`

See [apps/next-app-mixed-schemas](./apps/next-app-mixed-schemas) for a full working example.
For more adoption patterns, see
[docs/workflows-and-integrations.md](./docs/workflows-and-integrations.md).

### Generate docs from Drizzle schemas

`next-openapi-gen` works well with `drizzle-zod`, so your database schema, validation, and API docs can share the same source of truth.

```ts
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { posts } from "@/db/schema";

export const CreatePostSchema = createInsertSchema(posts, {
  title: (schema) => schema.title.min(5).max(255),
  content: (schema) => schema.content.min(10),
});

export const PostResponseSchema = createSelectSchema(posts);
```

See [apps/next-app-drizzle-zod](./apps/next-app-drizzle-zod) for the full CRUD example.

### Rely on inference when you want less annotation

If you omit `@response`, App Router handlers can infer responses from typed `NextResponse.json(...)` and `Response.json(...)` returns.

```ts
import { NextResponse } from "next/server";

type SearchResponse = {
  total: number;
};

/**
 * Search events
 * @responseDescription Search result
 * @openapi
 */
export async function POST(): Promise<NextResponse<SearchResponse>> {
  return NextResponse.json({ total: 3 });
}
```

Explicit `@response` tags still take precedence when you want stable schema names or exact response codes.

## Configuration

`init` creates a `next.openapi.json` file like this:

```json
{
  "openapi": "3.0.0",
  "info": {
    "title": "Next.js API",
    "version": "1.0.0",
    "description": "API generated by next-openapi-gen"
  },
  "apiDir": "src/app/api",
  "routerType": "app",
  "schemaDir": "src/schemas",
  "schemaType": "zod",
  "schemaFiles": [],
  "outputFile": "openapi.json",
  "outputDir": "./public",
  "docsUrl": "api-docs",
  "includeOpenApiRoutes": false,
  "ignoreRoutes": [],
  "debug": false
}
```

### Important options

| Option                                | Purpose                                                          |
| ------------------------------------- | ---------------------------------------------------------------- |
| `openapi`                             | Target `3.0.0`, `3.1.0`, or `3.2.0` output                       |
| `apiDir`                              | Route directory to scan                                          |
| `routerType`                          | `"app"` or `"pages"`                                             |
| `schemaDir`                           | Directory or directories to search for schemas/types             |
| `schemaType`                          | `"zod"`, `"typescript"`, or both                                 |
| `schemaFiles`                         | YAML/JSON OpenAPI fragments to merge into the generated document |
| `includeOpenApiRoutes`                | Only include handlers tagged with `@openapi`                     |
| `ignoreRoutes`                        | Exclude routes with wildcard support                             |
| `defaultResponseSet` / `responseSets` | Reusable error-response groups                                   |
| `errorConfig`                         | Shared error schema templates                                    |

For a fuller setup guide, Pages Router notes, response sets, and route exclusion
patterns, see [docs/getting-started.md](./docs/getting-started.md).

## JSDoc tags you will use most

| Tag                        | Purpose                                                          |
| -------------------------- | ---------------------------------------------------------------- |
| `@pathParams`              | Path parameter schema or type                                    |
| `@params` / `@queryParams` | Query parameter schema or type                                   |
| `@body`                    | Request body schema or type                                      |
| `@response`                | Response schema, code, and optional description                  |
| `@responseDescription`     | Response description without redefining the schema               |
| `@auth`                    | Security requirement(s), including comma-separated alternatives  |
| `@contentType`             | Request content type such as `multipart/form-data`               |
| `@examples`                | Request, response, and querystring examples                      |
| `@openapi`                 | Explicit inclusion marker when `includeOpenApiRoutes` is enabled |
| `@ignore`                  | Exclude a route from generation                                  |
| `@method`                  | Required HTTP method tag for Pages Router handlers               |

For the complete tag guide and usage recipes, see
[docs/jsdoc-reference.md](./docs/jsdoc-reference.md).

## Compatibility

| Area            | Support                                                      |
| --------------- | ------------------------------------------------------------ |
| Next.js routers | App Router and Pages Router                                  |
| OpenAPI targets | `3.0`, `3.1`, `3.2`                                          |
| Schema sources  | `zod`, `typescript`, drizzle-zod output, YAML/JSON fragments |
| Docs UIs        | Scalar, Swagger, Redoc, Stoplight Elements, RapiDoc          |

For Pages Router projects, set `routerType` to `"pages"` and annotate handlers with `@method`. See [apps/next-pages-router](./apps/next-pages-router).

## Example apps

Use the checked-in examples to evaluate the tool in realistic setups:

- [apps/next-app-zod](./apps/next-app-zod): Zod-first App Router example
- [apps/next-app-typescript](./apps/next-app-typescript): TypeScript-first example
- [apps/next-app-mixed-schemas](./apps/next-app-mixed-schemas): mixed schema migration example
- [apps/next-app-drizzle-zod](./apps/next-app-drizzle-zod): Drizzle + drizzle-zod CRUD example
- [apps/next-pages-router](./apps/next-pages-router): legacy Pages Router support
- [apps/next-app-scalar](./apps/next-app-scalar), [apps/next-app-swagger](./apps/next-app-swagger), [apps/next-app-redoc](./apps/next-app-redoc): docs UI variants

### Run an example

```bash
pnpm install
cd apps/next-app-zod
pnpm exec next-openapi-gen generate
pnpm dev
```

Then open `http://localhost:3000/api-docs`.

## Validation and coverage

This repo is not just a demo. The CI pipeline covers:

- formatting and linting
- workspace builds
- unit tests
- integration tests
- coverage reporting
- Playwright E2E runs across an app matrix

For the detailed version matrix and validation notes, see:

- [docs/openapi-version-coverage.md](./docs/openapi-version-coverage.md)
- [docs/zod4-support-matrix.md](./docs/zod4-support-matrix.md)

## Available UI providers

| Scalar                                                                                         | Swagger                                                                                          | Redoc                                                                                        | Stoplight Elements                                                                                            | RapiDoc                                                                                          |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| ![Scalar UI](https://raw.githubusercontent.com/tazo90/next-openapi-gen/main/assets/scalar.png) | ![Swagger UI](https://raw.githubusercontent.com/tazo90/next-openapi-gen/main/assets/swagger.png) | ![Redoc UI](https://raw.githubusercontent.com/tazo90/next-openapi-gen/main/assets/redoc.png) | ![Stoplight Elements UI](https://raw.githubusercontent.com/tazo90/next-openapi-gen/main/assets/stoplight.png) | ![RapiDoc UI](https://raw.githubusercontent.com/tazo90/next-openapi-gen/main/assets/rapidoc.png) |

## Advanced docs

Use these deeper references when you need more than the quick start:

- [docs/README.md](./docs/README.md): docs index
- [docs/getting-started.md](./docs/getting-started.md): setup, config, Pages Router notes, response sets, and production notes
- [docs/jsdoc-reference.md](./docs/jsdoc-reference.md): full route tag reference and examples
- [docs/workflows-and-integrations.md](./docs/workflows-and-integrations.md): mixed schemas, drizzle-zod, downstream tooling, and adoption patterns
- [docs/faq.md](./docs/faq.md): troubleshooting and common questions
- [docs/openapi-version-coverage.md](./docs/openapi-version-coverage.md): version-specific behavior, validation strategy, and generated vs preserved fields
- [docs/zod4-support-matrix.md](./docs/zod4-support-matrix.md): tested Zod 4 coverage and known boundaries
- [apps](./apps): complete runnable examples

## CLI

```bash
pnpm exec next-openapi-gen init
pnpm exec next-openapi-gen generate
```

### `init` options

| Option       | Choices                                                      | Default             |
| ------------ | ------------------------------------------------------------ | ------------------- |
| `--ui`       | `scalar`, `swagger`, `redoc`, `stoplight`, `rapidoc`, `none` | `scalar`            |
| `--schema`   | `zod`, `typescript`                                          | `zod`               |
| `--docs-url` | any string                                                   | `api-docs`          |
| `--output`   | any path                                                     | `next.openapi.json` |

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md) for setup, commit conventions, and workflow details.

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) for release history and recent changes.

## License

MIT
