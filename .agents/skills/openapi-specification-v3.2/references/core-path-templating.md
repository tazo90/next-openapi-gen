---
name: core-path-templating
description: Path templating and path parameters in OpenAPI 3.2
---

# Path Templating

Path templating uses **curly braces `{}`** to mark a section of the URL path as replaceable by a path parameter. The path is **appended** to the resolved [Server Object](core-server.md) URL (no relative URL resolution for path).

## Rules

- **Path keys** in the [Paths Object](paths-and-operations.md) MAY contain templated segments, e.g. `/pets/{petId}`, `/users/{userId}/orders`.
- **Path parameters:** Each template expression MUST correspond to a path parameter with `in: "path"` and `name` matching the segment (e.g. path `/pets/{petId}` → parameter `name: petId`, `in: path`). Exception: empty path item (e.g. ACL) does not require matching path params.
- **Required:** Path parameters MUST have `required: true`.
- **No templating** in Server `url` for path segments; path is appended to server URL. Server URL may have its own variables via Server Variable Object.
- **Value restrictions:** Path parameter values MUST NOT contain unescaped `/`, `?`, or `#` (RFC3986 generic syntax).

## Matching

- **Concrete before templated:** `/pets/mine` is matched before `/pets/{petId}` if both exist.
- **Identical paths invalid:** `/pets/{petId}` and `/pets/{name}` are considered identical and invalid (same hierarchy, different param names).
- **Ambiguous:** Paths like `/{entity}/me` and `/books/{id}` may lead to ambiguous resolution; tooling decides.

## ABNF (spec)

Path template: `/` *( path-segment `/` ) [ path-segment ]; path-segment = 1*( path-literal / template-expression ); template-expression = `{` template-expression-param-name `}`. Each template expression MUST NOT appear more than once in a single path.

## Example

```yaml
paths:
  /pets/{petId}:
    parameters:
      - name: petId
        in: path
        required: true
        schema:
          type: string
        description: ID of the pet
    get:
      responses:
        "200":
          description: The pet
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Pet'
```

## Key points

- Path parameter names are **case-sensitive** and must match the segment inside `{}` exactly.
- Each template expression must be covered by a path parameter (name + in: path) in the Path Item and/or operations.
- Path-level `parameters` can include path params so all operations on that path inherit them.

<!--
Source references:
- https://github.com/OAI/OpenAPI-Specification/blob/main/versions/3.2.0.md
-->
