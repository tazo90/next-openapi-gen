# OpenAPI Overlay

`next-openapi-gen` can apply and generate [OpenAPI Overlay](https://spec.openapis.org/overlay/latest.html)
documents. Overlay is a sibling of OpenAPI generation: it does not add JSDoc
tags, and core stays unaware of Overlay types.

Add an optional `overlay` block to `openapi-gen.config.ts` or `next.openapi.json`.
When the block is absent, the OpenAPI document is written unchanged.

```ts
export default defineConfig({
  openapi: "3.2.0",
  outputFile: "openapi.json",
  overlay: {
    version: "1.1.0",
    apply: ["./overlays/public.overlay.yaml"],
    generate: {
      files: ["./overlays/src/**/*.yaml"],
      outputFile: "partner.overlay.yaml",
    },
  },
});
```

Apply runs after OpenAPI finalize and before the spec is written. Actions run
in order. `target` (and Overlay 1.1 `copy`) use an RFC 9535 JSONPath subset:
child, index, wildcard, slice, descendant, and simple `?(@.prop == value)`
filters.

| Feature             | 1.0                                     | 1.1                       |
| ------------------- | --------------------------------------- | ------------------------- |
| `update` / `remove` | yes                                     | yes                       |
| `copy`              | omitted with `OVERLAY_COPY_UNSUPPORTED` | yes                       |
| Reusable Actions    | not implemented                         | Overlay 1.2, out of scope |

See `apps/next-app-zod/overlays/public.overlay.yaml` for a sample that removes
`/webhooks/payment` from the published spec.
