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
    version: "1.2.0",
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

Overlay 1.2 reusable actions live under `components.actions` and are referenced
from `actions` with a same-document `$ref` plus a required `target`. Optional
`targetFormat` (`openapi` | `asyncapi` | `arazzo`, or an absolute URI) follows
the still-open OAI Overlay draft for declaring the target document kind. A
reserved value that disagrees with the generated OpenAPI document emits
`OVERLAY_TARGET_FORMAT_MISMATCH` and skips that apply file. `applyOverlay`
itself stays format-agnostic, so the same JSONPath engine can update AsyncAPI
or Arazzo JSON when called directly. AsyncAPI documents are not generated.

| Feature           | 1.0                                              | 1.1                        | 1.2                           |
| ----------------- | ------------------------------------------------ | -------------------------- | ----------------------------- |
| `update`/`remove` | yes                                              | yes                        | yes                           |
| `copy`            | omitted with `OVERLAY_COPY_UNSUPPORTED`          | yes                        | yes                           |
| `$self`           | omitted with `OVERLAY_SELF_UNSUPPORTED`          | omitted with the same code | yes                           |
| Reusable actions  | inlined with `OVERLAY_REUSABLE_ACTION_INLINED`   | inlined with the same code | `components.actions` + `$ref` |
| `targetFormat`    | omitted with `OVERLAY_TARGET_FORMAT_UNSUPPORTED` | omitted with the same code | yes (OAI draft)               |

See `apps/next-app-zod/overlays/public.overlay.yaml` for a sample that removes
`/webhooks/payment` from the published spec with a reusable action.
