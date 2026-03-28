# FAQ And Troubleshooting

## Why is a route missing from the generated spec?

Check these first:

- the route is inside the configured `apiDir`
- the route is not matched by `ignoreRoutes`
- if `includeOpenApiRoutes` is `true`, the handler includes `@openapi`
- for Pages Router, the handler includes `@method`

If generation still misses the route, rerun with `debug: true` in
`next.openapi.json` to inspect discovery output.

## Why was my response not inferred?

Response inference is selective and best-effort.

It works best when:

- the handler returns typed `NextResponse.json(...)`
- the handler returns typed `Response.json(...)`
- the response type can be resolved cleanly by the TypeScript checker

Use explicit `@response` tags when you need exact component names, custom status
codes, or deterministic output.

## How do I exclude internal or private endpoints?

Use one of these approaches:

- add `@ignore` to a specific route
- add route patterns to `ignoreRoutes`
- enable `includeOpenApiRoutes` and only tag the routes you want exported

## Can I use this with the Pages Router?

Yes.

Set:

- `routerType` to `"pages"`
- `apiDir` to your Pages Router API directory
- `@method` on handlers

See [../apps/next-pages-router](../apps/next-pages-router) for a working
example.

## Should `openapi.json` live in `public/`?

`public/openapi.json` is the default because it is convenient for local
inspection and UI integrations.

If you do not want the spec exposed at that path:

- change `outputDir`
- disable the generated UI with `--ui none`
- wire your preferred private serving strategy separately

## Can I keep `/api-docs` private?

Yes. The generated docs page is just a normal Next.js route. Protect it the same
way you protect any other internal route in your application or deployment
environment.

## How do I model advanced security schemes?

Use route-level `@auth` for operation security requirements, and use
`schemaFiles` or template content for richer `components.securitySchemes`
objects such as OAuth details, API key locations, or OpenID Connect metadata.

## My imported types or schemas are not being resolved. What should I check?

Check:

- the exported type or schema name matches the JSDoc reference
- the file is under one of the configured `schemaDir` paths
- your path aliases are defined in `tsconfig.json`
- the target is exported from the module you expect

The checker can resolve path aliases in supported scenarios, but explicit route
metadata is still the safest option when output needs to be predictable.

## What is the best way to keep docs up to date?

The simplest workflow is:

1. update routes and schemas
2. run `next-openapi-gen generate`
3. review the spec or `/api-docs`
4. add generation to CI if the spec is part of your release contract

## Can I use the generated OpenAPI file with other tools?

Yes. The output is standard OpenAPI, so it can be consumed by docs platforms,
client generators, gateways, and other tooling that accepts OpenAPI files.

## Where should I look for deeper technical support details?

Start here:

- [Getting started and configuration](./getting-started.md)
- [JSDoc reference](./jsdoc-reference.md)
- [Workflows and integrations](./workflows-and-integrations.md)
- [OpenAPI version coverage](./openapi-version-coverage.md)
- [Zod 4 support matrix](./zod4-support-matrix.md)
