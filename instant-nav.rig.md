# instant-nav rig: next-openapi-gen samples

- BUILD: Playwright `webServer` runs `pnpm exec turbo run build --filter=next-openapi-gen...`, generates the spec, then `next build` and `next start` for `E2E_APP` (see `playwright.config.ts`). Never measure on `next dev`.
- EXPOSE: `experimental.exposeTestingApiInProductionBuild` is true when `EXPOSE_TESTING_API=1`. Playwright sets that env on `webServer`. Do not set it for real production deploys.
- RUN: `pnpm test:e2e:next-app-drizzle-zod` (or `cross-env E2E_APP=next-app-drizzle-zod pnpm test:e2e:app`) against `http://localhost:3105`. `baseURL` comes from `playwright.config.ts`.
- TEST USER: unauthenticated anonymous visitor. Sample apps have no login, flags, plans, or seeded session.
- DRIFT: none beyond which `E2E_APP` is selected. Docs UI copy is static; `/api-docs` still streams the Scalar client bundle after the static heading.
- LOOP: local `build → start → playwright test` via the existing e2e `webServer`. Agent-drivable; no deploy wait or secrets. CI uses the same command in `.github/workflows/ci.yml`.
- LIVENESS: n/a for local `next build && next start`. The artifact is the process Playwright just started.
- WALLS: Next.js 16.3+ with `cacheComponents: true` is required (`chore/next-16-3-partial-prefetch`). A client-only `/api-docs` page previously logged `Could not validate instant` because `worker_threads.workerData` was undefined; keep a static heading in the server page shell and do not set `export const instant = false`. Vite samples (TanStack, React Router) and the Pages Router app skip these guards.
