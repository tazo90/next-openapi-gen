---
name: components-reuse
description: Reusing components via $ref in OpenAPI 3.2
---

# Components Reuse

The [Components Object](schema-and-components.md) holds reusable objects. They have **no effect** on the API until explicitly referenced from outside Components (e.g. via [Reference Object](core-reference-object.md) `$ref`).

## Location

At root under `components`:

```yaml
openapi: 3.2.0
info: { ... }
paths: { ... }
components:
  schemas: { ... }
  parameters: { ... }
  responses: { ... }
  examples: { ... }
  requestBodies: { ... }
  headers: { ... }
  securitySchemes: { ... }
  links: { ... }
  callbacks: { ... }
  pathItems: { ... }
  mediaTypes: { ... }
```

## Structure

Each subsection is a map: key = logical name (MUST match `^[a-zA-Z0-9\.\-_]+$`), value = full object or Reference. Reference elsewhere with `$ref: '#/components/{section}/{name}'` or relative URI (e.g. `Pet.yaml`, `shared.yaml#/components/schemas/Foo`).

## Reuse patterns

- **Parameters:** Define in `components.parameters`; reference in path-level or operation-level `parameters` with `$ref: '#/components/parameters/skipParam'`. Uniqueness (name + in) is per operation; mix inline and $ref; no duplicate name+in.
- **Responses:** Define in `components.responses`; reference in operation `responses` with `$ref: '#/components/responses/NotFound'`. Mix inline and $ref; at least one response required per operation.
- **Schemas:** Define in `components.schemas`; reference in schema `$ref`, Media Type `schema`, Parameter/Header `schema`, etc. with `$ref: '#/components/schemas/Pet'`.
- **Request bodies:** Define in `components.requestBodies`; reference in operation `requestBody` with `$ref: '#/components/requestBodies/Foo'`.
- **Headers, examples, securitySchemes, links, callbacks, pathItems, mediaTypes:** Same pattern — define in Components, reference with `$ref` where that type is expected.

## Example

```yaml
components:
  parameters:
    skipParam:
      name: skip
      in: query
      required: true
      schema: { type: integer, format: int32 }
    limitParam:
      name: limit
      in: query
      required: true
      schema: { type: integer, format: int32 }
  responses:
    NotFound:
      description: Entity not found.
    GeneralError:
      description: General Error
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/GeneralError'
  schemas:
    GeneralError:
      type: object
      properties:
        code: { type: integer, format: int32 }
        message: { type: string }

paths:
  /pets:
    get:
      parameters:
        - $ref: '#/components/parameters/skipParam'
        - $ref: '#/components/parameters/limitParam'
      responses:
        "200":
          description: A list of pets.
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/Pet'
        "404":
          $ref: '#/components/responses/NotFound'
        default:
          $ref: '#/components/responses/GeneralError'
```

## Key points

- Components is a **library** only; nothing is applied globally. Reference explicitly where needed.
- Use for common parameters (pagination, API key), responses (404, 500), schemas, request bodies, headers so the spec stays DRY and consistent.
- When `$self` is present, use document's `$self` URI for reference resolution for interoperability.

<!--
Source references:
- https://github.com/OAI/OpenAPI-Specification/blob/main/versions/3.2.0.md
-->
