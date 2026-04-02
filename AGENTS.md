<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->

## Learned User Preferences

- Prefer Oxc config to stay close to standard defaults and avoid large hand-maintained rule lists unless there is a clear repo-specific need.
- Prefer simpler, direct APIs over wrapper factories or overly clever abstraction layers when they do not add clear value. Preserve existing user-facing CLI/API behavior during internal refactors, and avoid adding new config or customization surface unless it is explicitly requested. At app or API boundaries, prefer one client factory with direct method calls, inlining it when a call site uses it only once.
- Prefer standard, concise module names over verbose `create-*` filenames when the exported symbol already carries the constructor/factory meaning.
- Prefer `.ts`/`.mts` for tool and config files when the tool supports it, with proper typing over workarounds that drop type safety; keep inherently non-TS formats as-is (`.json`, `.yaml`, `.editorconfig`, `.gitattributes`, `.gitignore`, GitHub Actions workflow files); migrate remaining JavaScript-based configs where the toolchain supports typed configs cleanly (including release tooling and example apps).
- Prefer `openapi-gen` as the forward-looking CLI/config naming, but keep legacy `next-openapi-gen` and older config filenames working through a deprecation window instead of breaking existing apps immediately.
- Prefer a single shared Zod schema per domain when practical instead of parallel DTO or duplicate inferred types; keep provider-specific mapping in the provider package.
- Prefer `package.json`, VS Code tasks, and Turbo pipelines composed from plain `pnpm` and upstream CLIs over bespoke `.mjs` orchestrators, and avoid duplicate script entries such as `:turbo` variants that only mirror an existing command.
- Prefer committed workspace editor defaults when they make formatter, lint, and TypeScript SDK behavior consistent across contributors and agents.
- Prefer internal workspace package boundaries for core, CLI, init, and framework code when restructuring, while keeping `packages/next-openapi-gen` as the public compatibility and install surface until an explicit publishing change is requested.
- Keep automated tests for shared library behavior under the repo root `tests/` directory with domain-aligned subfolders that mirror `src/`; put cross-cutting scenario or behavior checks into `tests/**/regressions/` rather than leaving them flat at the root. Prefer checked-in project-style fixtures plus temp-copy harnesses for integration coverage over inline-generated temp app trees when realistic app structure matters; align integration coverage with documented JSDoc tags and README-backed examples where practical, and use real handler bodies in fixtures when testing implementation-driven inference.
- Keep Vitest coverage exclusions minimal; do not broadly exclude core source directories just to satisfy coverage thresholds.
- After a source restructure, prefer stable imports to concrete implementation files instead of keeping long-lived barrel re-export layers as the primary layout.

## Learned Workspace Facts

- Shared TypeScript baselines in `packages/typescript-config` (`base.json`, `nextjs.json`) intentionally follow a stricter preset.
- Workspace editor defaults live in `.vscode/`; they point TypeScript at the workspace SDK and use the Oxc VS Code extension for formatting and fixes.
- Git hooks are installed via `simple-git-hooks` from the root `package.json`; `pre-commit` runs `lint-staged` with Oxfmt/Oxlint and `commit-msg` runs `commitlint`. Root `.oxfmtrc.json` ignores `**/public/openapi.json`; when only such generated JSON is staged, `oxfmt` can otherwise receive no paths, so lint-staged runs `oxfmt` with `--no-error-on-unmatched-pattern` (root `package.json`).
- The workspace pins a Zod 3 compatibility catalog (and related apps) to the latest Zod 3 line; broad dependency major upgrades should not fold that track onto Zod 4.
- Vitest coverage thresholds in `vitest.config.ts` are `80/80/80` for statements, functions, and lines; branch thresholds are `80` for packaged scopes except `openapi-core` (`79`). See `coverageScopes` in `vitest.config.ts`.
- Integration generator fixtures live under `tests/fixtures/projects/`, and `tests/helpers/test-project.ts` provides temp-copy, template-materialization, and isolated-cwd helpers for running them; the `next/app-router/core-flow` fixture carries checked-in OpenAPI `3.0`/`3.1`/`3.2` templates, and `apps/next-app-next-config` plus `apps/next-app-zod` serve as concrete `3.1`/`3.2` examples.
- The repo now uses internal workspace packages for the generator split: `packages/openapi-core`, `packages/openapi-cli`, `packages/openapi-init`, `packages/openapi-framework-next`, `packages/openapi-framework-tanstack`, and `packages/openapi-framework-react-router`, while `packages/next-openapi-gen` remains the public compatibility facade.
- Built-in docs UI template assets live under `packages/next-openapi-gen/templates/init/ui/{nextjs,tanstack,reactrouter}`; `packages/next-openapi-gen/src/init/ui-registry.ts` maps UI metadata to those template files, the published package includes the `templates` directory alongside `dist`, and docs-page scaffolding dispatches by framework instead of assuming Next-only output.
- `apps/next-app-adapter` is the only Next sample that should use `adapterPath`; `apps/next-app-next-config` is the plain `next.config.ts` integration sample and should stay adapter-free.
- `packages/next-openapi-gen` CLI bundling in `tsup.config.ts` must externalize non-workspace runtime dependencies; bundling CommonJS packages like `commander` into the ESM CLI breaks sample-app `generate` with Node's `Dynamic require` error. Playwright e2e (`playwright.config.ts`) prebuilds the CLI workspace graph with `pnpm exec turbo run build --filter=next-openapi-gen...` so internal packages have `dist/` outputs in clean checkouts.
- GitHub Actions CI is defined in `.github/workflows/ci.yml` (quality, build, unit, integration, coverage, parallelized E2E, default-branch/`workflow_dispatch`); standard Linux jobs use `pnpm exec turbo run` for build and other tasks wired in `turbo.json` where applicable; `.github/dependabot.yml` maintains Actions dependencies; generator benchmarks use `vitest.bench.config.ts` (`pnpm test:bench`, `pnpm test:bench:vitest` under `tests/bench`).
- OpenAPI generation writes `.openapi-gen/manifest.json` only when `NODE_ENV !== "production"`; it is dev-only metadata (for example config path, diagnostics, performance) and `.openapi-gen/` stays gitignored.
