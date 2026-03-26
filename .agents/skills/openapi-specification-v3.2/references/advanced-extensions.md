---
name: advanced-extensions
description: Specification extensions (x-) in OpenAPI 3.2
---

# Specification Extensions

Additional data can be added at certain points using **patterned fields** prefixed with `x-`.

| Field Pattern | Type | Description |
|---------------|------|-------------|
| ^x-           | Any  | Extension property. Name MUST start with `x-` (e.g. `x-internal-id`). Value = any valid JSON. |
| x-oai-*, x-oas-* | — | Reserved for OpenAPI Initiative. |

Extensions are a way to prove viability of proposed spec additions. Implementations are RECOMMENDED to support extensibility. Support for any one extension is OPTIONAL.

The OpenAPI Initiative maintains extension registries (individual keywords and namespaces); see spec.openapis.org.

## Example

```yaml
paths:
  /pets:
    x-internal-id: pets-v1
    get:
      x-rate-limit: 100
      responses:
        "200":
          description: OK
```

## Key points

- All extension names start with `x-`; do not use `x-oai-` or `x-oas-` for custom extensions.
- Use extensions for tool-specific or experimental metadata; document them for consumers.

<!--
Source references:
- https://github.com/OAI/OpenAPI-Specification/blob/main/versions/3.2.0.md
-->
