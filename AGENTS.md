<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->

## Learned User Preferences

- Prefer Oxc config to stay close to standard defaults and avoid large hand-maintained rule lists unless there is a clear repo-specific need.
- Prefer simpler, direct APIs over wrapper factories or overly clever abstraction layers when they do not add clear value. At app or API boundaries, prefer one client factory with direct method calls, inlining it when a call site uses it only once.
- Prefer standard, concise module names over verbose `create-*` filenames when the exported symbol already carries the constructor/factory meaning.
- Prefer proper typed config fixes, such as using `.mts` for ESM config files, over workarounds that drop type safety.
- Prefer a single shared Zod schema per domain when practical instead of parallel DTO or duplicate inferred types; keep provider-specific mapping in the provider package.
- Prefer `package.json`, VS Code tasks, and Turbo pipelines composed from plain `pnpm` and upstream CLIs over bespoke `.mjs` orchestrators, and avoid duplicate script entries such as `:turbo` variants that only mirror an existing command.

## Learned Workspace Facts
