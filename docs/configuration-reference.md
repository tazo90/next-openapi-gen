# Configuration reference

This is the complete reference for the public fields accepted by
`defineConfig()` in `openapi-gen.config.ts`. The config is both an OpenAPI
template and generator configuration: standard OpenAPI document fields seed the
document, while generator-only fields control discovery and emitted artifacts.

```ts
import { defineConfig, FrameworkKind } from "next-openapi-gen";

export default defineConfig({
  openapi: "3.2.0",
  info: {
    title: "Store API",
    version: "1.0.0",
  },
  apiDir: "./src/app/api",
  schemaDir: ["./src/schemas", "./src/types"],
  schemaType: ["zod", "typescript"],
  outputDir: "./public",
  outputFile: "openapi.json",
  framework: {
    kind: FrameworkKind.Nextjs,
    router: "app",
  },
});
```

Paths are resolved from the process working directory unless a field says
otherwise.

## OpenAPI template fields

These fields seed the generated OpenAPI document. Route discovery and schema
processing merge into them.

| Field               | Type                                  | Required | Purpose                                                                                                            |
| ------------------- | ------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------ |
| `openapi`           | `string`                              | yes      | OpenAPI version string. Generation targets `3.0`, `3.1`, `3.2`, or experimental `3.3-preview` based on this value. |
| `info`              | OpenAPI Info Object                   | yes      | API title, version, description, contact, license, and other Info fields.                                          |
| `$self`             | `string`                              | no       | OpenAPI 3.2 self URI. Version finalization removes unsupported fields from older targets.                          |
| `jsonSchemaDialect` | `string`                              | no       | Default JSON Schema dialect for OpenAPI 3.1 and later.                                                             |
| `servers`           | OpenAPI Server Object[]               | no       | Document-level servers. A default server is added when this is absent or empty.                                    |
| `paths`             | OpenAPI Paths Object                  | no       | Hand-authored paths merged with discovered routes.                                                                 |
| `webhooks`          | `Record<string, Path Item Object>`    | no       | Hand-authored webhooks; supported by applicable OpenAPI targets.                                                   |
| `components`        | OpenAPI Components Object             | no       | Reusable schemas, responses, security schemes, and other components.                                               |
| `security`          | OpenAPI Security Requirement[]        | no       | Document-level security requirements.                                                                              |
| `tags`              | OpenAPI Tag Object[]                  | no       | Document-level tag definitions, merged with discovered tags.                                                       |
| `externalDocs`      | OpenAPI External Documentation Object | no       | External documentation metadata.                                                                                   |

Specification extensions such as `x-internal-id` are preserved. See
[OpenAPI version coverage](./openapi-version-coverage.md) for fields that are
kept, transformed, or removed per target.

## Route and schema discovery

| Field                  | Type                                  | Default           | Purpose                                                                                                                     |
| ---------------------- | ------------------------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `apiDir`               | `string`                              | `"./src/app/api"` | Route directory to scan.                                                                                                    |
| `routerType`           | `"app" \| "pages"`                    | `"app"`           | Next.js router convention. `framework.router` takes precedence for an explicit Next framework block.                        |
| `schemaDir`            | `string \| string[]`                  | `"./src"`         | Directory or directories searched for exported schemas and types.                                                           |
| `schemaType`           | `"zod" \| "typescript" \| Array<...>` | `"typescript"`    | Enabled schema backends. Duplicate array entries are normalized away.                                                       |
| `schemaFiles`          | `string[]`                            | `[]`              | YAML or JSON OpenAPI fragments merged before route-derived schemas.                                                         |
| `includeOpenApiRoutes` | `boolean`                             | `false`           | When `true`, only handlers marked with `@openapi` are included.                                                             |
| `ignoreRoutes`         | `string[]`                            | `[]`              | Route patterns to omit. Wildcards are supported.                                                                            |
| `excludeSchemas`       | `string[]`                            | `[]`              | Schema names or glob patterns to remove from `components.schemas`; references to excluded schemas are inlined where needed. |

When multiple schema backends are enabled, resolution priority is
`schemaFiles`, then Zod, then TypeScript.

## Output, docs UI, and framework

| Field          | Type                       | Default            | Purpose                                                                                 |
| -------------- | -------------------------- | ------------------ | --------------------------------------------------------------------------------------- |
| `outputDir`    | `string`                   | `"./public"`       | Directory for the generated OpenAPI document.                                           |
| `outputFile`   | `string`                   | `"openapi.json"`   | Generated OpenAPI filename.                                                             |
| `docsUrl`      | `string`                   | `"api-docs"`       | Application route used when scaffolding a docs page.                                    |
| `ui`           | `string`                   | `"scalar"`         | Docs UI template name, such as `scalar`, `swagger`, `redoc`, `stoplight`, or `rapidoc`. |
| `generatedDir` | `string`                   | `".openapi-gen"`   | Development manifest and disk-cache workspace.                                          |
| `docs`         | `DocsEmitterConfig`        | absent             | Opts generation into docs-page artifact emission.                                       |
| `framework`    | `FrameworkConfig`          | Next.js App Router | Selects route scanning and framework metadata.                                          |
| `next`         | `{ adapterPath?: string }` | absent             | Compatibility form for a Next adapter path; prefer `framework` for new typed configs.   |

### `docs`

```ts
docs: {
  enabled: true,
  framework: "vite",
}
```

| Field       | Type                                 | Behavior                                                                                                                                                                                                                                                                                    |
| ----------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `enabled`   | `boolean`                            | The built-in docs emitter runs only when this is exactly `true`. `false` disables it.                                                                                                                                                                                                       |
| `framework` | `"next" \| "vite" \| "react-router"` | Selects the docs-page template written at generate time. `vite` emits the TanStack route (`src/routes/<docsUrl>.tsx`). When omitted, the emitter infers Next, TanStack, or React Router from `framework.kind`, including the legacy `"react-router"` kind used in sample React Router apps. |

Docs generation uses `docsUrl`, `ui`, and `outputFile`, and records a `docs`
artifact when a page is written. Treat the target page as generated
scaffolding; keep custom UI work outside it or disable docs emission after
scaffolding.

### `framework`

Use the exported enum in typed configuration:

```ts
framework: {
  kind: FrameworkKind.Tanstack,
  modulePath: "./src/routes",
}
```

| Field         | Type                                                                          | Behavior                                                                                         |
| ------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `kind`        | `FrameworkKind.Nextjs \| FrameworkKind.Tanstack \| FrameworkKind.ReactRouter` | Selects the framework route source. Resolved values are `nextjs`, `tanstack`, and `reactrouter`. |
| `router`      | `"app" \| "pages"`                                                            | Required for the Next.js variant.                                                                |
| `modulePath`  | `string`                                                                      | Optional framework module metadata.                                                              |
| `adapterPath` | `string`                                                                      | Optional adapter metadata. It is also used as `modulePath` when `modulePath` is absent.          |

For Next.js, `framework.adapterPath` falls back to `next.adapterPath`.

## Diagnostics, logging, and cache

| Field          | Type                                                              | Default                    | Purpose                                                                                                                                                                      |
| -------------- | ----------------------------------------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `diagnostics`  | `{ enabled?: boolean; failOn?: "never" \| "warning" \| "error" }` | enabled, `failOn: "never"` | `failOn` sets the threshold returned to the CLI. `enabled` is normalized and exposed to hooks, but the current generator still collects diagnostics regardless of its value. |
| `debug`        | `boolean`                                                         | `false`                    | Enables additional generator logging.                                                                                                                                        |
| `cache`        | `boolean`                                                         | `true`                     | Enables process reuse and the disk cache under `generatedDir/cache`.                                                                                                         |
| `experimental` | `{ parallelRoutes?: boolean }`                                    | absent                     | Public experimental config container. `parallelRoutes` is currently accepted but not read by the route scanner.                                                              |

`OPENAPI_GEN_CACHE=0` disables caching and `OPENAPI_GEN_CACHE=1` enables it,
overriding `cache`.

Route and schema discovery automatically skip `node_modules`, `.git`, `dist`,
`.next`, `.turbo`, and `.cache` directories. The generator reports
`route-directory-ignored` and `schema-directory-ignored` warnings when it
encounters these directories. This prevents dependency, build-output, and cache
trees from silently widening discovery. Because these are warnings,
`diagnostics.failOn: "warning"` and `--fail-on warning` also fail generation
when an automatically ignored directory is encountered; `failOn: "error"` does
not.

In non-production runs, generation writes `generatedDir/manifest.json` with the
config path, output path, diagnostics, and performance data. The manifest is not
written when `NODE_ENV=production`.

### Cache hits and artifact side effects

A cache hit normally returns the prior result without rerunning generation.
When any artifact side effect is configured, the cache instead reuses the
cached **base OpenAPI document** and reruns the artifact pipeline. Side effects
are present when:

- `docs` exists and `docs.enabled !== false`
- any `clientSdk` entry has `enabled !== false`
- `arazzo` is configured
- `overlay` is configured
- `hooks.artifactsWritten` is configured

Consequently, Overlay application, the spec write, Arazzo, docs, client SDK
commands, and `artifactsWritten` can run again on a cache hit. The returned
result reports `cached: true`. Hooks that belong to building the base document
(`configLoaded`, `routesDiscovered`, and `documentBuilt`) do not run when that
base document is reused.

## Authentication and reusable responses

| Field                | Type                              | Purpose                                                                                                                                                                                                 |
| -------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `authPresets`        | `Record<string, string>`          | Extends or replaces names in the `@auth` keyword mapping. Defaults include `bearer: "BearerAuth"`, `basic: "BasicAuth"`, and `apikey: "ApiKeyAuth"`.                                                    |
| `defaultResponseSet` | `string`                          | Name of the response set applied by default.                                                                                                                                                            |
| `responseSets`       | `Record<string, string[]>`        | Named lists of response codes for reuse with `@responseSet`.                                                                                                                                            |
| `errorConfig`        | `ErrorTemplateConfig`             | Generates reusable error responses from one JSON-compatible `template`, a `codes` map, and optional shared `variables`. Each code has a `description`, optional `httpStatus`, and optional `variables`. |
| `errorDefinitions`   | `Record<string, ErrorDefinition>` | Defines response components directly; each value contains a `description` and OpenAPI `schema`. Used when `errorConfig` is absent.                                                                      |

Example preset override:

```ts
authPresets: {
  service: "ServiceToken",
}
```

The built-in presets remain available because custom entries are merged over
them.

## Watch mode

```ts
watch: {
  enabled: true,
  debounceMs: 200,
}
```

| Field        | Type      | Default | Behavior                                                                                                                                                                    |
| ------------ | --------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `enabled`    | `boolean` | absent  | Public integration hint. Core `watchProject()` does not use this field to start or stop watching; use `openapi-gen generate --watch` or the integration's own watch option. |
| `debounceMs` | `number`  | `120`   | Delay before regeneration after a watched change.                                                                                                                           |

Watch mode observes `apiDir`, every `schemaDir`, every `schemaFiles` entry, and
the loaded config file. The initial generation must succeed before watch mode
returns its stop function; an initial failure rejects and closes all registered
watchers. Later regeneration failures are logged and the watcher stays active.

## Client SDK generation

`clientSdk` runs one or more external generators after the OpenAPI spec is
written:

```ts
clientSdk: [
  {
    name: "typescript-fetch",
    command: "node",
    args: ["./scripts/generate-typescript-client.mjs"],
    outputDir: "./src/generated/api",
  },
  {
    name: "python",
    command: "node",
    args: ["./scripts/generate-python-client.mjs"],
    outputDir: "./clients/python",
    enabled: process.env.GENERATE_PYTHON_SDK === "1",
  },
];
```

Each enabled entry runs sequentially as:

```text
command ...args <absolute-spec-path> [outputDir]
```

The generator appends the spec path, then appends `outputDir` when provided.
Shape `args` so those final positional values are valid for the selected tool.
The example uses small Node wrappers with the stable contract
`wrapper <spec-path> <output-dir>` because common generators place flags between
their input and output values. A TypeScript wrapper can translate that contract
to a real generator:

```js
import { spawnSync } from "node:child_process";

const [specPath, outputDir] = process.argv.slice(2);
const result = spawnSync("pnpm", ["exec", "openapi-generator-cli", "generate", "-g", "typescript-fetch", "-i", specPath, "-o", outputDir], { stdio: "inherit", shell: false });

process.exit(result.status ?? 1);
```

If a generator reads its output location from its own config, omit
`clientSdk.outputDir`; only the spec path is then appended.

| Field       | Type       | Behavior                                                                      |
| ----------- | ---------- | ----------------------------------------------------------------------------- |
| `name`      | `string`   | Optional descriptive label. It does not affect execution.                     |
| `command`   | `string`   | Executable to run. Required.                                                  |
| `args`      | `string[]` | Arguments placed before the generated spec path.                              |
| `outputDir` | `string`   | Appended after the spec path and reported as an `sdk` artifact after success. |
| `enabled`   | `boolean`  | Entries run unless this is exactly `false`; omitted means enabled.            |

If a command cannot start or exits non-zero, generation rejects immediately,
later SDK entries do not run, and `artifactsWritten` is not called. Output from
the child process is inherited by the terminal. The spec and any earlier
artifacts or SDK output are not rolled back, so SDK generators should write
atomically when partial output would be unsafe.

Security: commands execute through `cross-spawn` with an argument array and
`shell: false`. This supports Windows `.cmd` package-manager shims without
interpolating a command string. Shell syntax, interpolation, pipes, redirects,
and chained commands are not evaluated. Config files are executable code;
review `command` and `args` from untrusted changes before running generation.

## Generation hooks

Hooks are synchronous callbacks for observing or modifying a generation run:

```ts
hooks: {
  configLoaded({ config }) {
    console.log(`Scanning ${config.apiDir}`);
  },
  routesDiscovered({ paths, diagnostics }) {
    console.log(`${Object.keys(paths).length} paths, ${diagnostics.length} diagnostics`);
  },
  documentBuilt({ document }) {
    document.info.description ??= "Generated from application routes";
  },
  artifactsWritten({ artifacts }) {
    console.log(artifacts.map((artifact) => `${artifact.kind}: ${artifact.path}`));
  },
}
```

| Hook               | Context                                                  | Lifecycle                                                                                                                                                             |
| ------------------ | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `configLoaded`     | `{ config: ResolvedOpenApiConfig; configPath?: string }` | First base-document phase, before the template and fragments are prepared. The current core invocation supplies `config`; `configPath` is optional and may be absent. |
| `routesDiscovered` | `{ config; paths; tags; diagnostics }`                   | After routes/webhooks are scanned and paths/tags are merged, before defaults, error components, and schemas are finalized.                                            |
| `documentBuilt`    | `{ config; document; diagnostics }`                      | After version finalization, before Overlay, writing, Arazzo, docs, and SDK emission. Mutations to `document` affect later artifacts.                                  |
| `artifactsWritten` | `{ config; artifacts }`                                  | Last, after spec, Overlay/Arazzo, docs, and enabled SDK commands complete.                                                                                            |

Artifact entries have `kind: "spec" | "docs" | "sdk" | "arazzo" | "overlay"`
and an absolute or emitter-provided `path`. A callback exception aborts the
run. Because hooks are not awaited, start and manage asynchronous work yourself
only when it is safe for generation to finish before that work.

## Overlay and Arazzo

### `overlay`

```ts
overlay: {
  version: "1.1.0",
  apply: ["./overlays/public.overlay.yaml"],
  generate: {
    files: ["./overlays/source/**/*.yaml"],
    outputDir: "./public",
    outputFile: "partner.overlay.yaml",
  },
}
```

| Field                 | Type       | Purpose                                                                  |
| --------------------- | ---------- | ------------------------------------------------------------------------ |
| `version`             | `string`   | Overlay target version; defaults to `1.1.0`.                             |
| `apply`               | `string[]` | Overlay files applied in order before the OpenAPI spec is written.       |
| `generate.files`      | `string[]` | Source files used to generate an Overlay document.                       |
| `generate.outputDir`  | `string`   | Generated Overlay output directory; defaults to the OpenAPI `outputDir`. |
| `generate.outputFile` | `string`   | Generated Overlay filename; defaults to `overlay.yaml`.                  |

See [OpenAPI Overlay](./overlay.md) for supported operations and versions.

### `arazzo`

```ts
arazzo: {
  version: "1.1.0",
  files: ["./arazzo/**/*.yaml"],
  outputDir: "./public",
  outputFile: "arazzo.yaml",
}
```

| Field        | Type       | Purpose                                                         |
| ------------ | ---------- | --------------------------------------------------------------- |
| `version`    | `string`   | Arazzo target version; defaults to `1.1.0`.                     |
| `files`      | `string[]` | Workflow files compiled against generated `operationId` values. |
| `outputDir`  | `string`   | Arazzo output directory; defaults to the OpenAPI `outputDir`.   |
| `outputFile` | `string`   | Arazzo output filename; defaults to `arazzo.yaml`.              |

See [Arazzo workflows](./arazzo.md) for validation and version behavior.
