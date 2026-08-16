# Arazzo workflows

`next-openapi-gen` can compile [Arazzo](https://spec.openapis.org/arazzo/latest.html)
workflow files after OpenAPI generation. This is a companion specification, not
extra OpenAPI paths and not an AsyncAPI generator.

Add an optional `arazzo` block to `openapi-gen.config.ts` or `next.openapi.json`.
When the block is absent, generation stays OpenAPI-only.

```ts
export default defineConfig({
  openapi: "3.2.0",
  outputFile: "openapi.json",
  arazzo: {
    version: "1.1.0",
    files: ["./arazzo/**/*.yaml"],
    outputFile: "arazzo.yaml",
  },
});
```

Workflow files reference generated `operationId` values. Unknown ids emit an
`ARAZZO_UNKNOWN_OPERATION_ID` error. `sourceDescriptions.type: asyncapi` is
accepted and reported as info; AsyncAPI documents are not generated.

| Feature                                            | 1.0                  | 1.1 |
| -------------------------------------------------- | -------------------- | --- |
| `sourceDescriptions.type: openapi` + `operationId` | yes                  | yes |
| `Selector` objects on success criteria             | stripped             | yes |
| `in: querystring`                                  | rewritten to `query` | yes |
| `$self`                                            | stripped             | yes |
| `dependsOn` / `timeout`                            | stripped             | yes |

See `apps/next-app-zod/arazzo/purchase-pet.yaml` for a sample that calls
`getOrdersList` and `createOrder`.
