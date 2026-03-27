<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->

## Learned User Preferences

- Prefer Oxc config to stay close to standard defaults and avoid large hand-maintained rule lists unless there is a clear repo-specific need.
- Prefer simpler, direct APIs over wrapper factories or overly clever abstraction layers when they do not add clear value. At app or API boundaries, prefer one client factory with direct method calls, inlining it when a call site uses it only once.
- Prefer standard, concise module names over verbose `create-*` filenames when the exported symbol already carries the constructor/factory meaning.
- Prefer `.ts`/`.mts` for tool and config files when the tool supports it, with proper typing over workarounds that drop type safety; keep inherently non-TS formats as-is (`.json`, `.yaml`, `.editorconfig`, `.gitattributes`, `.gitignore`, GitHub Actions workflow files); migrate remaining JavaScript-based configs where the toolchain supports typed configs cleanly (including release tooling and example apps).
- Prefer a single shared Zod schema per domain when practical instead of parallel DTO or duplicate inferred types; keep provider-specific mapping in the provider package.
- Prefer `package.json`, VS Code tasks, and Turbo pipelines composed from plain `pnpm` and upstream CLIs over bespoke `.mjs` orchestrators, and avoid duplicate script entries such as `:turbo` variants that only mirror an existing command.
- Prefer committed workspace editor defaults when they make formatter, lint, and TypeScript SDK behavior consistent across contributors and agents.
- For `packages/next-openapi-gen`, keep a single published package and refactor via internal module boundaries only; do not extract additional workspace packages.
- Keep automated tests for shared library behavior under the repo root `tests/` directory with domain-aligned subfolders and consistent naming rather than one flat tests folder.
- After a source restructure, prefer stable imports to concrete implementation files instead of keeping long-lived barrel re-export layers as the primary layout.

## Learned Workspace Facts

- Shared TypeScript baselines in `packages/typescript-config` (`base.json`, `nextjs.json`) intentionally follow a stricter preset.
- Workspace editor defaults live in `.vscode/`; they point TypeScript at the workspace SDK and use the Oxc VS Code extension for formatting and fixes.
- Git hooks are installed via `simple-git-hooks` from the root `package.json`; `pre-commit` runs `lint-staged` with Oxfmt/Oxlint and `commit-msg` runs `commitlint`.
- The workspace pins a Zod 3 compatibility catalog (and related apps) to the latest Zod 3 line; broad dependency major upgrades should not fold that track onto Zod 4.
