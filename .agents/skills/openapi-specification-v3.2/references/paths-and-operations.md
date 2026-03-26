---
name: paths-and-operations
description: Paths Object, Path Item, and Operation Object in OpenAPI 3.2
---

# Paths and Operations

## Paths Object

Maps relative path strings to Path Item objects. Path is **appended** to the resolved Server URL (no relative URL resolution). Path keys MUST start with `/`. Path templating allowed (e.g. `/pets/{petId}`). Paths MAY be empty (e.g. ACL filtering).

- Each template expression in the path MUST correspond to a path parameter in the Path Item and/or its operations (exception: empty path item).
- Path parameter values MUST NOT contain unescaped `/`, `?`, or `#`.
- Concrete path (e.g. `/pets/mine`) is matched before templated path (e.g. `/pets/{petId}`). Paths like `/pets/{petId}` and `/pets/{name}` are identical and invalid.

## Path Item Object

Describes operations on a single path. MAY be empty (ACL). Path-level `$ref` allowed; referenced structure MUST be a Path Item Object.

| Field                | Type   | Description |
|----------------------|--------|-------------|
| $ref                 | string | URI to Path Item Object; conflicts with local fields. |
| summary, description | string | Apply to all operations on this path. |
| get, put, post, delete, options, head, patch, trace | Operation Object | One per HTTP method. |
| query                 | Operation Object | QUERY method (IETF safe-method-w-body). |
| additionalOperations  | Map[string, Operation Object] | Additional methods; key = HTTP method. |
| servers               | [Server Object] | Overrides OpenAPI-level servers for this path. |
| parameters            | [Parameter \| Reference] | Apply to all operations; overridable at operation, not removable; no duplicate name+in. |

## Operation Object

Describes one API operation.

| Field         | Type   | Description |
|---------------|--------|-------------|
| tags          | [string] | Tags for grouping. |
| summary       | string | Short summary. |
| description   | string | Verbose behavior; CommonMark allowed. |
| externalDocs  | External Documentation Object | Extra docs. |
| operationId   | string | Unique ID; case-sensitive; RECOMMENDED for codegen. |
| parameters    | [Parameter \| Reference] | Overrides path params; no duplicate name+in. |
| requestBody   | Request Body \| Reference | Request body; semantics well-defined where HTTP defines them (e.g. POST); avoid for GET/DELETE. |
| responses     | Responses Object | **REQUIRED**. Possible responses. |
| callbacks     | Map[string, Callback \| Reference] | Out-of-band callbacks. |
| deprecated    | boolean | Default false. |
| security      | [Security Requirement Object] | Overrides root; [] removes. |
| servers       | [Server Object] | Overrides path/root servers. |

## Example

```yaml
paths:
  /pets:
    get:
      summary: List pets
      operationId: listPets
      responses:
        "200":
          description: A list of pets.
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/Pet'
    parameters:
      - name: id
        in: path
        required: true
        schema:
          type: array
          items:
            type: string
        style: simple
```

## Key points

- Operation MUST have `responses` with at least one code; SHOULD document success (e.g. 200).
- Parameter uniqueness: `name` + `in` (e.g. one `query` param named `id`).
- Use `operationId` for stable client/server code generation.
- `additionalOperations` is for methods beyond get/put/post/delete/options/head/patch/trace/query (e.g. custom or future HTTP methods).

<!--
Source references:
- https://github.com/OAI/OpenAPI-Specification/blob/main/versions/3.2.0.md
-->
