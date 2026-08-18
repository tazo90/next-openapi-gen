# Performance Benchmarks

This project tracks generator performance at three levels:

- Schema micro-benchmarks for hot schema helpers.
- Full generator reports across the fixture matrix.
- CLI subprocess benchmarks for the real `openapi-gen` command path.

The CI benchmark job is informational. It uploads current reports and surfaces regressions in logs, but it does not block merges.

## Commands

| Command                            | Purpose                                                                                                             |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `pnpm test:bench:schema:check`     | Runs schema micro-benchmarks and compares `tests/bench/schema/current.json` to `tests/bench/schema/baseline.json`.  |
| `pnpm test:bench:generator:check`  | Writes `tests/bench/generator/current.json` and compares it to `tests/bench/generator/baseline.json`.               |
| `pnpm test:bench:generator:update` | Refreshes the committed generator baseline after intentional performance changes.                                   |
| `pnpm test:bench:profile`          | Prints phase-level timing summaries for the full generator matrix.                                                  |
| `pnpm test:bench:scale`            | Prints phase-level timing summaries for the opt-in `*-at-scale` fixture tier (~100 operations, ~50 schema modules). |
| `pnpm test:bench:cli`              | Builds the CLI package, runs subprocess benchmarks, and runs the watch-mode smoke check.                            |
| `pnpm test:bench:all`              | Runs schema, generator, and CLI benchmark coverage.                                                                 |

## Generator Matrix

The generator report covers 11 project fixtures across OpenAPI 3.0, 3.1, and 3.2, with both cold and warm profiles for each scenario. Each row records the full `GeneratorPerformanceProfile`, including route scanning, parsing, TypeScript response inference, schema lookup, schema merge, and document finalization.

Canonical scenarios to inspect first:

- `next/app-router/core-flow` with OpenAPI 3.2 for broad TypeScript route coverage.
- `next/app-router/zod-full-coverage` with OpenAPI 3.2 for Zod-heavy behavior.
- `next/app-router/ts-full-coverage` with OpenAPI 3.2 for TypeScript schema-heavy behavior.
- `next/app-router/drizzle-zod-flow` with OpenAPI 3.2 for Drizzle-Zod conversion.
- `tanstack/core-flow` and `react-router/core-flow` with OpenAPI 3.2 for non-Next adapters.
- `remix`, `sveltekit`, `nuxt`, `astro`, `hono`, and `express` `core-flow` fixtures cover the newer adapters. `*-at-scale` rows and bench-matrix entries for those stacks are a follow-up.

## Scale Fixture Tier

Large realistic apps are materialized by `pnpm generate:scale-fixtures` into `tests/fixtures/projects/**/*-at-scale` and `apps/**/generated/`. Each scale fixture targets roughly 125 operations and 50 generated schema modules (plus copied catalog schemas on full-coverage fixtures).

Regenerate after changing `scripts/fixture-scale/` domain or emitters. Do not hand-edit generated route or schema files.

Run the opt-in scale benchmark tier locally when profiling large-app performance:

```bash
pnpm generate:scale-fixtures --target all --clean
pnpm test:bench:scale
```

Scale scenarios are excluded from `pnpm test:bench:generator:check` so CI bench time and baseline size stay stable.

## Reading A Report

`tests/bench/generator/current.json` contains:

- `machine`: CPU, OS, and Node metadata for the run.
- `iterations`: number of samples averaged for each scenario.
- `scenarios`: cold and warm summaries keyed by fixture, framework, schema flavor, router, and OpenAPI version.
- `topPhases`: the five slowest phase timers for quick triage.

Use cold/warm ratio as the first cache-effectiveness signal. If warm time is close to cold time, route file parsing, schema discovery, or TypeScript inference is still rebuilding too much state.

## Current Optimization Levers

The generator has process-local caches for route scanning, route file content, route ASTs, schema file ASTs, schema discovery, and TypeScript projects. Watch mode uses `SharedGenerationRuntime` automatically.

Opt-in cross-run caching is enabled by default. Disable it with:

```json
{
  "cache": false
}
```

You can also force cache behavior for a single run:

```bash
OPENAPI_GEN_CACHE=0 pnpm generate:apps
OPENAPI_GEN_CACHE=1 pnpm generate:apps
```

The disk cache fingerprints config files, API route files, schema files, custom schema files, package metadata, lockfile, and `tsconfig.json`. It reuses the existing spec only when inputs are unchanged and no docs or SDK side effects need to run.

## Parallel Parse Prototype

`tests/bench/generator/route-parse-worker.bench.ts` compares sequential Babel parsing with a worker-thread pool for route files. This is intentionally benchmark-only because the production generator is synchronous and the TypeScript checker should remain on the main thread.

If the worker prototype shows a consistent win on large fixtures, the next production step should be an asynchronous generation path or a worker-backed pre-analysis phase that still performs path/schema merging on the main thread.

## Updating Baselines

Update baselines only after reviewing profile diffs and confirming a performance change is intentional:

```bash
pnpm test:bench:schema:update
pnpm test:bench:generator:update
```

For optimization PRs, include the current profile diff for the canonical scenarios and call out which phase moved.
