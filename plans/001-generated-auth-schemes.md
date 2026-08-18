# Plan 001: Emit usable securitySchemes and combined auth requirements

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat d647b07..HEAD -- packages/openapi-core/src/shared/jsdoc.ts packages/openapi-core/src/shared/spec.ts packages/openapi-core/src/routes/operation-processor.ts packages/openapi-core/src/core/orchestrator.ts packages/openapi-core/src/openapi/document-types.ts docs/jsdoc-reference.md docs/zod4-support-matrix.md docs/openapi-version-coverage.md docs/faq.md docs/example-app-coverage-plan.md apps/next-app-zod/openapi-gen.config.ts apps/next-app-zod/src/app/api/auth/session/route.ts apps/next-app-zod/public/openapi.json apps/next-app-scalar/src/app/api/auth/login/route.ts tests/unit/shared/jsdoc.test.ts tests/unit/shared/spec.test.ts tests/unit/routes/operation-processor.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `d647b07`, 2026-08-18

## Why this matters

Client generators need both operation `security` **and** matching
`components.securitySchemes`. Today `@auth bearer` writes `{ BearerAuth: [] }`
on the operation and stops there. If the app template omitted the scheme
object, consumers get a dangling name and patch the spec by hand.

A second, live bug makes the docs lie: `@security BearerAuth, ApiKeyAuth`
is documented as alternatives (OR) but parsed as one scheme named
`"BearerAuth, ApiKeyAuth"`. That is what `apps/next-app-zod` ships today.
Combined (AND) requirements already exist in the `@security` parser via `;`,
but `@auth` has no equivalent and the Zod matrix still tells people to put
combined requirements in templates.

This plan does **not** grow `authPresets` into OAuth flow objects. It emits
default objects for the three built-in presets, gives `@auth` the same AND
syntax `@security` already uses, and puts cookie + bearer + scoped OAuth in
one sample. Custom OAuth flows stay in `components` / `schemaFiles`.

## Current state

Relevant files:

- `packages/openapi-core/src/shared/spec.ts` — preset name map only (`bearer → BearerAuth`). No scheme objects.
- `packages/openapi-core/src/routes/operation-processor.ts` — `@auth` splits on comma and emits one requirement object per item (OR only).
- `packages/openapi-core/src/shared/jsdoc.ts` — `@security` parser. `;` is AND. `segment.split(":")` drops scopes that contain colons (`read:events` becomes `read`). Comma without a colon is **not** treated as OR.
- `packages/openapi-core/src/core/orchestrator.ts` — merges schemas and error responses; never fills `components.securitySchemes`.
- `packages/openapi-init/src/init/openapi-template.ts` — init writes `BearerAuth` into the template. Apps that delete it get nothing.
- `docs/jsdoc-reference.md` — documents comma `@auth` as OR, and `@security Scheme:scope1|scope2`. Advanced scheme objects "should still be modeled in templates".
- `docs/zod4-support-matrix.md:48` — combined requirements and advanced scheme fields "belong in templates".
- `apps/next-app-zod/src/app/api/auth/session/route.ts:25` — `@security BearerAuth, ApiKeyAuth` (intended OR).
- `apps/next-app-zod/public/openapi.json:11782-11786` — shipped output is `{ "BearerAuth, ApiKeyAuth": [] }`.
- `apps/next-app-scalar/src/app/api/auth/login/route.ts:21` — same comma-as-OR intent: `@security BasicAuth, BearerAuth`.

Preset map and `@auth` OR-only emission:

```145:159:packages/openapi-core/src/shared/spec.ts
export const DEFAULT_AUTH_PRESET_REPLACEMENTS: Record<string, string> = {
  bearer: "BearerAuth",
  basic: "BasicAuth",
  apikey: "ApiKeyAuth",
};

export function performAuthPresetReplacements(
  authValue: string,
  presets: Record<string, string> = DEFAULT_AUTH_PRESET_REPLACEMENTS,
): string {
  const authParts = authValue.split(",").map((part) => part.trim());
  const mappedParts = authParts.map((part) => presets[part.toLowerCase()] || part);

  return mappedParts.join(",");
}
```

```121:133:packages/openapi-core/src/routes/operation-processor.ts
    if (explicitSecurity && explicitSecurity.length > 0) {
      definition.security = explicitSecurity.map((req) =>
        Object.fromEntries(
          Object.entries(req).map(([scheme, scopes]) => [this.applyPreset(scheme), scopes]),
        ),
      );
    } else if (auth) {
      const mapped = performAuthPresetReplacements(auth, this.authPresets);
      const authItems = mapped.split(",").map((item) => item.trim());
      definition.security = authItems.map((authItem) => ({
        [authItem]: [],
      }));
    }
```

`@security` parser as it exists (AND via `;`, scopes via first `split(":")`):

```466:496:packages/openapi-core/src/shared/jsdoc.ts
function parseSecurityTag(commentValue: string): import("./types.js").OpenApiSecurityRequirement[] {
  const matches = [...commentValue.matchAll(SECURITY_TAG_RE)];
  const requirements: import("./types.js").OpenApiSecurityRequirement[] = [];
  for (const match of matches) {
    const raw = (match[1] as string).trim();
    // format: <scheme>[:scope1,scope2][; <scheme2>[:scope...]]
    const entry: import("./types.js").OpenApiSecurityRequirement = {};
    const segments = raw
      .split(";")
      .map((segment) => segment.trim())
      .filter(Boolean);
    for (const segment of segments) {
      const [schemeRaw, scopesRaw] = segment.split(":");
      const scheme = schemeRaw?.trim();
      if (!scheme) {
        continue;
      }
      const scopes = scopesRaw
        ? scopesRaw
            .split(",")
            .map((scope) => scope.trim())
            .filter(Boolean)
        : [];
      entry[scheme] = scopes;
    }
    if (Object.keys(entry).length > 0) {
      requirements.push(entry);
    }
  }
  return requirements;
}
```

Existing unit contract to keep (do not break):

```412:442:tests/unit/shared/jsdoc.test.ts
      * @security bearer:read,write; apiKey
      // ...
      security: [{ bearer: ["read", "write"], apiKey: [] }],
```

OpenAPI semantics (do not invent new ones): `security` is an array of
requirement objects. **OR between array entries. AND between keys in one
entry.** Scopes live in the string array for that scheme. See
`.claude/skills/openapi-specification-v3.2/references/security-requirement-object.md`.

Repo conventions to match:

- Tests live under repo-root `tests/`, not inside the package. Unit tests
  colocated by domain (`tests/unit/shared/`, `tests/unit/routes/`,
  `tests/unit/openapi/`). Integration fixtures under
  `tests/fixtures/projects/` plus `tests/helpers/test-project.ts`
  (`generateFixtureSpec`, `createTempProject`, `writeAppRoute`).
- New modules use a concise name, not `create-*`. Import concrete files
  (`../shared/security-requirements.js`), not a new barrel.
- `packages/openapi-core` emits with `isolatedDeclarations` — exported
  functions need explicit return types.
- Do **not** add `authPresets` object values, cookie as a fourth preset, or
  JSDoc for OAuth flows. `authPresets` stays `Record<string, string>`.
- Conventional commits, e.g. `feat: emit default securitySchemes for auth presets`.
- Do not edit `apps/**/src/app/api/generated/**` or scale-fixture trees.

## Commands you will need

| Purpose        | Command                                                                                                                                                                                                                                                   | Expected on success                            |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Unit (auth)    | `pnpm exec vitest run --config vitest.config.ts tests/unit/shared/jsdoc.test.ts tests/unit/shared/spec.test.ts tests/unit/shared/security-requirements.test.ts tests/unit/routes/operation-processor.test.ts tests/unit/openapi/security-schemes.test.ts` | all pass                                       |
| Integration    | `pnpm exec vitest run --config vitest.config.ts tests/integration/generator/security-schemes.test.ts tests/integration/generator/example-app-zod-security.test.ts`                                                                                        | all pass                                       |
| Typecheck core | `pnpm typecheck:packages`                                                                                                                                                                                                                                 | exit 0                                         |
| Lint package   | `pnpm --filter @workspace/openapi-core lint`                                                                                                                                                                                                              | exit 0, no warnings                            |
| Sample spec    | `pnpm --filter next-app-zod generate`                                                                                                                                                                                                                     | writes `apps/next-app-zod/public/openapi.json` |

## Suggested executor toolkit

- Use the `openapi-specification-v3.2` skill (`references/security-requirement-object.md`, `references/security-scheme-types.md`) before changing parsers.
- Use the `vitest` skill for new tests (one concept per test, no shared mutable generator state, restore nothing global).
- Use the `typescript` skill for `isolatedDeclarations` export types.

## Scope

**In scope** (the only files you should modify or create):

- `packages/openapi-core/src/shared/security-requirements.ts` (create)
- `packages/openapi-core/src/openapi/security-schemes.ts` (create)
- `packages/openapi-core/src/shared/jsdoc.ts`
- `packages/openapi-core/src/shared/spec.ts`
- `packages/openapi-core/src/routes/operation-processor.ts`
- `packages/openapi-core/src/core/orchestrator.ts`
- `tests/unit/shared/security-requirements.test.ts` (create)
- `tests/unit/shared/jsdoc.test.ts`
- `tests/unit/shared/spec.test.ts`
- `tests/unit/routes/operation-processor.test.ts`
- `tests/unit/openapi/security-schemes.test.ts` (create)
- `tests/fixtures/projects/next/app-router/security-schemes/` (create; see Step 4)
- `tests/integration/generator/security-schemes.test.ts` (create)
- `tests/integration/generator/example-app-zod-security.test.ts` (create)
- `apps/next-app-zod/openapi-gen.config.ts`
- `apps/next-app-zod/src/app/api/auth/elevated/route.ts` (create)
- `apps/next-app-zod/src/app/api/integrations/github/route.ts` (create)
- `apps/next-app-zod/public/openapi.json` (regenerate, do not hand-edit)
- `apps/next-app-scalar/public/openapi.json` (regenerate only if Step 6 changes its `/auth/login` security object)
- `docs/jsdoc-reference.md`
- `docs/zod4-support-matrix.md`
- `docs/openapi-version-coverage.md`
- `docs/faq.md`
- `docs/example-app-coverage-plan.md`
- `plans/README.md`

**Out of scope** (do NOT touch, even though they look related):

- `authPresets` type and config shape — remains `Record<string, string>`.
- A fourth built-in preset for cookie / OAuth / mTLS / OIDC.
- JSDoc syntax that authors OAuth `flows`, `openIdConnectUrl`, or `oauth2MetadataUrl`.
- `packages/openapi-init` template — init may keep its existing `BearerAuth` object; generation fills gaps when it is absent.
- `apps/**/src/app/api/generated/**`, scale fixtures, and `pnpm generate:scale-fixtures`.
- Spreading the Security pack across TypeScript / TanStack / React Router apps.
- Public-route `security: []` / optional `{}` unless it already works with zero extra syntax.
- New diagnostics for unknown scheme names.

## Git workflow

- Branch: `advisor/001-generated-auth-schemes`
- Commit per logical unit (parser, scheme emission, sample+docs). Message style:
  `feat: emit default securitySchemes for auth presets`
- Do NOT push or open a PR unless the operator instructed it.

## Target grammar (both `@auth` and `@security`)

Parse each tag value with one function. Multiple `@security` tags still
concatenate (OR across tags).

```
requirement-list := and-group ("," and-group)*
and-group        := scheme-use (";" scheme-use)*
scheme-use       := scheme-name [":" scopes]
scopes           := scope (("|" | ",") scope)*
scheme-name      := /[A-Za-z][A-Za-z0-9._-]*/
```

Once `:` is seen on a scheme, remaining `,` and `|` until `;` or the next
OR-group boundary are **scopes**, not new schemes. That is what makes
`OAuth2Auth:repo,user` and `ApiKeyAuth:read:events|write:events` work.

Examples and required outputs:

| Input                                              | Output                                                                  |
| -------------------------------------------------- | ----------------------------------------------------------------------- |
| `bearer,apikey`                                    | `[{ BearerAuth: [] }, { ApiKeyAuth: [] }]` after presets                |
| `bearer;apikey`                                    | `[{ BearerAuth: [], ApiKeyAuth: [] }]`                                  |
| `bearer;apikey,custom`                             | `[{ BearerAuth: [], ApiKeyAuth: [] }, { custom: [] }]`                  |
| `bearer:read,write; apiKey`                        | `[{ bearer: ["read", "write"], apiKey: [] }]` before presets            |
| `OAuth2Auth:read:pets,write:pets`                  | `[{ OAuth2Auth: ["read:pets", "write:pets"] }]`                         |
| `BearerAuth, ApiKeyAuth:read:events\|write:events` | `[{ BearerAuth: [] }, { ApiKeyAuth: ["read:events", "write:events"] }]` |
| `BearerAuth, ApiKeyAuth`                           | `[{ BearerAuth: [] }, { ApiKeyAuth: [] }]`                              |

`@auth` applies presets to scheme names after parse. `@security` already
does this in `OperationProcessor.applyPreset`. Keep that.

`@auth` may carry scopes (same grammar) so the parsers stay one function.
Document scopes on `@security` as the supported way; `@auth` remains the
preset shortcut.

## Default scheme objects

Only these three built-in keywords get a generated object. Names come from
the resolved `authPresets` map (user keys win):

```ts
{
  bearer: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
  basic: { type: "http", scheme: "basic" },
  apikey: { type: "apiKey", in: "header", name: "X-Api-Key" },
}
```

These match `apps/next-app-zod/openapi-gen.config.ts` and the init
`BearerAuth` object.

Emission rules:

1. Collect scheme names from `document.security`, every operation under
   `document.paths` and `document.webhooks` (`OPENAPI_HTTP_METHODS` plus
   `additionalOperations` values).
2. For each referenced name, if it equals a built-in preset **value**
   (`authPresets.bearer ?? "BearerAuth"`, same for `basic` / `apikey`) and
   `components.securitySchemes[name]` is missing, assign the default object
   for that keyword.
3. Never overwrite a scheme that already exists (template / `schemaFiles` /
   `components` win).
4. Never emit objects for custom preset values (`oauth2 → OAuth2Auth`) or
   unknown names (`SessionCookie`, `PartnerToken`).
5. Do not emit unused presets. `@auth bearer` must not invent `BasicAuth`.
6. Insert under `document.components.securitySchemes`, creating
   `components` if needed. Sort **newly added** keys with
   `localeCompare(..., "en", { sensitivity: "base" })` so output is
   deterministic. Leave pre-existing keys in place.

## Steps

### Step 1: Shared requirement parser

Create `packages/openapi-core/src/shared/security-requirements.ts` with:

- `parseSecurityRequirementList(raw: string): OpenApiSecurityRequirement[]`
- `applyAuthPresets(requirements: OpenApiSecurityRequirement[], presets: Record<string, string>): OpenApiSecurityRequirement[]`
- `BUILTIN_AUTH_PRESET_KEYWORDS` = `["bearer", "basic", "apikey"] as const`
- `DEFAULT_BUILTIN_SECURITY_SCHEMES` — the three objects above, keyed by keyword
- Re-export or import `DEFAULT_AUTH_PRESET_REPLACEMENTS` from `spec.ts` rather than duplicating the name map

Implement the grammar in "Target grammar". Reject empty scheme names
(`:empty` already skipped in `jsdoc.test.ts`). Trim whitespace.

Update `parseSecurityTag` in `jsdoc.ts` to call
`parseSecurityRequirementList` per `@security` match and concatenate.

Update `performAuthPresetReplacements` so it maps tokens split on both `,`
and `;` and **preserves those separators**:

```
"bearer;apikey,custom" + defaults → "BearerAuth;ApiKeyAuth,custom"
```

Keep the existing comma-only tests passing.

Point `OperationProcessor` `@auth` handling at parse-then-`applyAuthPresets`
instead of "split on comma → one object each". `@security` should keep
using `applyPreset` per key (or switch to `applyAuthPresets` — same result).

**Verify**: `pnpm exec vitest run --config vitest.config.ts tests/unit/shared/jsdoc.test.ts tests/unit/shared/spec.test.ts tests/unit/routes/operation-processor.test.ts` → existing tests pass. Then add `tests/unit/shared/security-requirements.test.ts` covering every row in the grammar table, including `read:pets` and the docs `|` example. Re-run the same command plus the new file → all pass.

Add to `operation-processor.test.ts`:

- `@auth bearer;apikey` → `[{ BearerAuth: [], ApiKeyAuth: [] }]`
- `@auth bearer;apikey,custom` → AND then OR
- remapped `bearer → JwtAuth` still applies inside an AND group

### Step 2: Emit default scheme objects

Create `packages/openapi-core/src/openapi/security-schemes.ts` with
`ensureBuiltinSecuritySchemes(document: OpenApiDocument, authPresets: Record<string, string>): void`.

Call it from `runGenerationOrchestrator` in `orchestrator.ts` **after**
paths, webhooks, tags, and error components are merged, and **before**
`getOpenApiVersionProcessor(...).finalize(document)` (today that finalize
call is at `orchestrator.ts:174`). Pass `config.authPresets`.

Walk operations using `OPENAPI_HTTP_METHODS` from
`packages/openapi-core/src/openapi/document-types.ts`. Also walk
`pathItem.additionalOperations` if present.

**Verify**: `pnpm exec vitest run --config vitest.config.ts tests/unit/openapi/security-schemes.test.ts` → all pass. Cases:

- referenced `BearerAuth` / `BasicAuth` / `ApiKeyAuth` with empty
  `components` → those three objects appear (only the referenced ones)
- existing `BearerAuth: { type: "http", scheme: "bearer" }` (no
  `bearerFormat`) is left unchanged
- remapped `authPresets.bearer = "JwtAuth"` + operation `{ JwtAuth: [] }`
  → emits the bearer default under `JwtAuth`
- referenced `SessionCookie` / `OAuth2Auth` → not invented
- unused `basic` preset is not emitted when only bearer is referenced
- root `security: [{ BearerAuth: [] }]` with no operation `@auth` still
  emits `BearerAuth`

### Step 3: Integration fixture without template schemes

Create `tests/fixtures/projects/next/app-router/security-schemes/`:

```
templates/openapi-3.0.json   # no components.securitySchemes
src/app/api/public/route.ts  # GET, @openapi, no @auth
src/app/api/profile/route.ts # GET, @auth bearer
src/app/api/admin/route.ts   # GET, @auth bearer;apikey
src/app/api/legacy/route.ts  # GET, @auth basic
```

`templates/openapi-3.0.json` should look like
`tests/fixtures/projects/next/app-router/zod-only-coverage/templates/openapi-3.0.json`
(info + `apiDir` / `schemaType` / output fields) and must **omit**
`securitySchemes`. Use `includeOpenApiRoutes: true` so `@openapi` is
required, matching that fixture.

Hand-written handlers may return `Response.json({ ok: true })`.

Create `tests/integration/generator/security-schemes.test.ts` modeled on
`tests/integration/generator/zod4-support.test.ts` (`generateFixtureSpec`).

Assert:

- `/profile` GET `security` is `[{ BearerAuth: [] }]`
- `/admin` GET `security` is `[{ BearerAuth: [], ApiKeyAuth: [] }]`
- `/legacy` GET `security` is `[{ BasicAuth: [] }]`
- `components.securitySchemes` equals the three defaults for Bearer /
  ApiKey / Basic (Basic only because `/legacy` referenced it; if you drop
  `/legacy`, do not expect Basic)
- `/public` has no `security` (or inherits nothing invented)

**Verify**: `pnpm exec vitest run --config vitest.config.ts tests/integration/generator/security-schemes.test.ts` → all pass.

### Step 4: Combined-requirement docs + Zod sample

In `apps/next-app-zod/openapi-gen.config.ts`, **add** (do not remove the
existing three schemes):

```ts
SessionCookie: {
  type: "apiKey",
  in: "cookie",
  name: "session",
},
OAuth2Auth: {
  type: "oauth2",
  flows: {
    authorizationCode: {
      authorizationUrl: "https://github.com/login/oauth/authorize",
      tokenUrl: "https://github.com/login/oauth/access_token",
      scopes: {
        repo: "Full repository access",
        user: "Read user profile",
      },
    },
  },
},
```

Leave `BearerAuth` / `ApiKeyAuth` / `BasicAuth` in config. Generation must
not overwrite them. Custom OAuth stays in components, not JSDoc.

Create two hand-written routes (not under `src/app/api/generated/`):

1. `apps/next-app-zod/src/app/api/auth/elevated/route.ts`
   - `GET`
   - `@auth bearer;SessionCookie`
   - `@operationId zodGetElevatedSession`
   - `@tag Auth`
   - `@response SessionResponse` (already exported from `@/schemas/session`)
   - real handler: `return NextResponse.json({})`
2. `apps/next-app-zod/src/app/api/integrations/github/route.ts`
   - `GET`
   - `@security OAuth2Auth:repo,user`
   - `@operationId zodListGithubRepos`
   - `@tag Integrations`
   - `@response 200` with a simple description (no new schema required)
   - real handler: `return NextResponse.json([])`

Do **not** change the `@security BearerAuth, ApiKeyAuth` line on
`apps/next-app-zod/src/app/api/auth/session/route.ts`. The parser fix must
make that tag emit OR. Same for
`apps/next-app-scalar/src/app/api/auth/login/route.ts`.

`@cookie SessionCookies` on the session route is a **parameter** annotation.
Do not treat it as a security scheme.

Update docs:

- `docs/jsdoc-reference.md` Authentication section: comma = OR, semicolon =
  AND, presets still map names, **and** the three presets now emit default
  scheme objects when referenced and missing. Keep the `authPresets` +
  `components.securitySchemes` override example for custom / remapped
  names. Say custom OAuth/OIDC objects stay in `components` or `schemaFiles`.
- `docs/jsdoc-reference.md` `@security` section: replace the `|` -only
  story with the grammar above. Document that
  `@security BearerAuth, ApiKeyAuth` is OR, `@security bearer:read,write; apiKey`
  is AND, and `Scheme:scope1|scope2` **or** `Scheme:scope1,scope2` attaches
  scopes (first `:` wins, so `read:events` is a scope).
- `docs/zod4-support-matrix.md` Known Boundaries: delete or rewrite the
  line that says combined requirements and advanced scheme fields belong in
  templates. Combined requirements are generated. Default http/apiKey
  objects are generated. OAuth/OIDC **flow objects** still belong in
  templates / `schemaFiles`.
- `docs/openapi-version-coverage.md` Shared Strategy and the 3.0
  "Error response components and security requirements" note: same split.
- `docs/faq.md` "How do I model advanced security schemes?": `@auth` /
  `@security` generate requirements **and** the three preset objects;
  OAuth flows / cookie names / OIDC URLs still go in `components` or
  `schemaFiles`.
- `docs/example-app-coverage-plan.md` Security pack: mark next-app-zod as
  covering bearer, cookie, scoped OAuth, comma OR, semicolon AND. Leave
  TypeScript / framework-parity apps as follow-up.

Create `tests/integration/generator/example-app-zod-security.test.ts`.
`generateProjectSpec` defaults to `next.openapi.json`, which this app does
not have. Drive generation the same way as
`tests/unit/generator/openapi-generator.test.ts` / zod smoke: copy is
optional if you import the config.

Recommended:

```ts
import { OpenApiGenerator } from "next-openapi-gen";
import zodConfig from "../../../apps/next-app-zod/openapi-gen.config.ts";

const spec = new OpenApiGenerator({ config: zodConfig }).generate();
```

Run that **from** `apps/next-app-zod` via `withProjectCwd` in
`tests/helpers/test-project.ts` so `apiDir` / `schemaDir` resolve. If
`OpenApiGenerator` requires cwd + config and that fails twice, STOP and
report — do not invent a second config loader.

Assert:

- `paths["/auth/session"].get.security` equals
  `[{ BearerAuth: [] }, { ApiKeyAuth: [] }]`
- `paths["/auth/elevated"].get.security` equals
  `[{ BearerAuth: [], SessionCookie: [] }]`
- `paths["/integrations/github"].get.security` equals
  `[{ OAuth2Auth: ["repo", "user"] }]`
- `components.securitySchemes.SessionCookie` and `.OAuth2Auth` match the
  config objects
- `components.securitySchemes.BearerAuth` still has `bearerFormat: "JWT"`

**Verify**: `pnpm exec vitest run --config vitest.config.ts tests/integration/generator/example-app-zod-security.test.ts` → all pass.

### Step 5: Regenerate the Zod (and Scalar) committed specs

From the repo root:

```
pnpm --filter next-app-zod generate
```

Confirm `apps/next-app-zod/public/openapi.json` now has:

- `/auth/session` GET security `[{ "BearerAuth": [] }, { "ApiKeyAuth": [] }]`
- `/auth/elevated` and `/integrations/github` as in Step 4
- `SessionCookie` and `OAuth2Auth` under `components.securitySchemes`

If Scalar's committed spec still contains a scheme named
`"BasicAuth, BearerAuth"`, run `pnpm --filter next-app-scalar generate`
and include that `public/openapi.json` in the same commit.

Do not hand-edit those JSON files.

**Verify**: `rg -n '"BearerAuth, ApiKeyAuth"' apps/next-app-zod/public/openapi.json` → no matches. `rg -n '"/auth/elevated"' apps/next-app-zod/public/openapi.json` → a path entry exists.

### Step 6: Package typecheck and lint

**Verify**: `pnpm typecheck:packages` → exit 0.

**Verify**: `pnpm --filter @workspace/openapi-core lint` → exit 0.

## Test plan

New tests (names are intent, not required titles):

| File                                                           | Cases                                                                                                                                     |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/unit/shared/security-requirements.test.ts`              | every grammar table row; empty / whitespace-only input; preset remap inside AND                                                           |
| `tests/unit/shared/jsdoc.test.ts`                              | add `@security BearerAuth, ApiKeyAuth` → two requirement objects; add `OAuth2Auth:read:pets,write:pets`; keep `bearer:read,write; apiKey` |
| `tests/unit/shared/spec.test.ts`                               | `performAuthPresetReplacements("bearer;apikey")` preserves `;`                                                                            |
| `tests/unit/routes/operation-processor.test.ts`                | `@auth bearer;apikey`; remapped AND                                                                                                       |
| `tests/unit/openapi/security-schemes.test.ts`                  | emit / skip / remap / ignore custom / unused preset / root security                                                                       |
| `tests/integration/generator/security-schemes.test.ts`         | fixture with no template schemes                                                                                                          |
| `tests/integration/generator/example-app-zod-security.test.ts` | OR / AND / scoped OAuth / preserved cookie + OAuth objects                                                                                |

Pattern: `tests/unit/shared/jsdoc.test.ts` for parser tables;
`tests/integration/generator/zod4-support.test.ts` for `generateFixtureSpec`.

Verification: the unit + integration commands in the table above, all pass,
including the new files.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm typecheck:packages` exits 0
- [ ] The unit command in "Commands you will need" exits 0
- [ ] The integration command in "Commands you will need" exits 0
- [ ] `rg -n '"BearerAuth, ApiKeyAuth"' apps/next-app-zod/public/openapi.json` prints nothing
- [ ] `rg -n "belong in templates" docs/zod4-support-matrix.md` no longer describes combined requirements as template-only
- [ ] `git diff --name-only` lists no files outside the in-scope list (except `plans/README.md`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The excerpts in "Current state" no longer match the files (drift).
- `OpenApiGenerator({ config: zodConfig })` cannot generate the Zod app
  because config discovery, `schemaDir`, or Arazzo/Overlay hooks fail
  twice. Do not add a new public config API to paper over it.
- Making comma-without-colon mean OR breaks a test that **intentionally**
  wanted a scheme name containing a comma. Quote the test and stop.
- Emitting default schemes appears to require changing `authPresets` to
  hold objects, or adding cookie/oauth as built-in keywords.
- A step's verification fails twice after a reasonable fix attempt.
- The fix appears to require touching an out-of-scope file (generated
  route trees, init template rewrite, framework apps).

## Maintenance notes

- Reviewers should check the shipped `/auth/session` security object first.
  If it is still `"BearerAuth, ApiKeyAuth"`, the parser fix did not land.
- Reviewers should check that `SessionCookie` and `OAuth2Auth` come from
  config, not from invented JSDoc flow syntax.
- If a later change adds a cookie preset, it must not silently overwrite
  app-specific cookie names (`session` vs `sb-access-token` in the
  core-flow fixture).
- Follow-up explicitly deferred: Security pack on
  `next-app-typescript` / TanStack / React Router; `security: []` public
  routes; diagnostics for dangling custom scheme names; generating OAuth
  flow objects from JSDoc.
- Issue #99 asked for the larger surface (OIDC, mTLS, typed helpers). This
  plan is the tighter slice that unblocks client generation without growing
  config.
