<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->

## Learned User Preferences

- Prefer Oxc config to stay close to standard defaults and avoid large hand-maintained rule lists unless there is a clear repo-specific need.
- Prefer simpler, direct APIs over wrapper factories or overly clever abstraction layers when they do not add clear value. Preserve existing user-facing CLI/API behavior during internal refactors, and avoid adding new config or customization surface unless it is explicitly requested. At app or API boundaries, prefer one client factory with direct method calls, inlining it when a call site uses it only once.
- Prefer standard, concise module names over verbose `create-*` filenames when the exported symbol already carries the constructor/factory meaning.
- Prefer `.ts`/`.mts` for tool and config files when the tool supports it, with proper typing over workarounds that drop type safety; keep inherently non-TS formats as-is (`.json`, `.yaml`, `.editorconfig`, `.gitattributes`, `.gitignore`, GitHub Actions workflow files); migrate remaining JavaScript-based configs where the toolchain supports typed configs cleanly (including release tooling and example apps).
- Prefer a single shared Zod schema per domain when practical instead of parallel DTO or duplicate inferred types; keep provider-specific mapping in the provider package.
- Prefer `package.json`, VS Code tasks, and Turbo pipelines composed from plain `pnpm` and upstream CLIs over bespoke `.mjs` orchestrators, and avoid duplicate script entries such as `:turbo` variants that only mirror an existing command.
- Prefer committed workspace editor defaults when they make formatter, lint, and TypeScript SDK behavior consistent across contributors and agents.
- For `packages/next-openapi-gen`, keep a single published package and refactor via internal module boundaries only; do not extract additional workspace packages.
- Keep automated tests for shared library behavior under the repo root `tests/` directory with domain-aligned subfolders that mirror `src/`; put cross-cutting scenario or behavior checks into `tests/**/regressions/` rather than leaving them flat at the root. Prefer checked-in project-style fixtures plus temp-copy harnesses for integration coverage over inline-generated temp app trees when realistic app structure matters.
- Keep Vitest coverage exclusions minimal; do not broadly exclude core source directories just to satisfy coverage thresholds.
- After a source restructure, prefer stable imports to concrete implementation files instead of keeping long-lived barrel re-export layers as the primary layout.

## Learned Workspace Facts

- Shared TypeScript baselines in `packages/typescript-config` (`base.json`, `nextjs.json`) intentionally follow a stricter preset.
- Workspace editor defaults live in `.vscode/`; they point TypeScript at the workspace SDK and use the Oxc VS Code extension for formatting and fixes.
- Git hooks are installed via `simple-git-hooks` from the root `package.json`; `pre-commit` runs `lint-staged` with Oxfmt/Oxlint and `commit-msg` runs `commitlint`.
- The workspace pins a Zod 3 compatibility catalog (and related apps) to the latest Zod 3 line; broad dependency major upgrades should not fold that track onto Zod 4.
- Vitest coverage thresholds in `vitest.config.ts` are currently `90/90/90/90` for statements, branches, functions, and lines.
- Integration generator fixtures live under `tests/fixtures/projects/`, and `tests/helpers/test-project.ts` provides temp-copy, template-materialization, and isolated-cwd helpers for running them.
- Built-in docs UI template assets live under `packages/next-openapi-gen/templates/init/ui/`; `packages/next-openapi-gen/src/init/ui-registry.ts` maps UI metadata to those template files, and the published package includes the `templates` directory alongside `dist`.
