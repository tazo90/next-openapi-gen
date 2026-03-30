---
name: parameters
description: Parameter Object, locations, style, and content in OpenAPI 3.2
---

# Parameter Object

Describes a single operation parameter. Uniqueness: `name` + `in`.

## Parameter locations (`in`)

| Value       | Description |
|------------|-------------|
| path       | With path templating; part of URL path. MUST NOT appear with `in: "querystring"`. |
| query      | Appended to URL. MUST NOT appear with `in: "querystring"` in same operation/path. |
| querystring | Entire query string as value; MUST use `content` (often `application/x-www-form-urlencoded`); at most one; no `in: "query"` in same operation/path. |
| header     | Custom request headers; names case-insensitive per RFC9110. |
| cookie     | Cookie value. Use `in: "cookie"`; defining cookie via header has undefined effect. |

## Common fields (with `schema` or `content`)

| Field        | Type   | Description |
|-------------|--------|-------------|
| name        | string | **REQUIRED**. Case-sensitive. For path, MUST match template in path. For header: Accept, Content-Type, Authorization → definition SHALL be ignored. |
| in          | string | **REQUIRED**. `"query"`, `"querystring"`, `"header"`, `"path"`, or `"cookie"`. |
| description | string | Brief description; CommonMark allowed. |
| required    | boolean | If path, **REQUIRED** and MUST be true. Default false. |
| deprecated  | boolean | Default false. |
| allowEmptyValue | boolean | (Deprecated.) For query only; default false. |
| example, examples | Any / Map | Mutually exclusive; see Working with Examples. |

## With `schema` (simpler cases)

MUST NOT be used with `in: "querystring"`.

| Field       | Type   | Description |
|------------|--------|-------------|
| style      | string | Serialization: path default `simple`; query `form`; header `simple`; cookie `form` (prefer `style: "cookie"` for cookie). Values: matrix, label, simple, form, spaceDelimited, pipeDelimited, deepObject, cookie. |
| explode    | boolean | For array/object: separate params per value/pair. form/cookie default true; others false. |
| allowReserved | boolean | Reserved expansion (RFC6570); default false. |
| schema      | Schema Object | Type for the parameter. |

For header/cookie: no percent-encoding on serialization; no decoding on parse; pass through unchanged (see Appendix D).

## With `content` (complex cases)

| Field   | Type   | Description |
|--------|--------|-------------|
| content | Map[string, Media Type Object \| Reference] | **One** entry: media type → representation. Required for `in: "querystring"`. |

## Example (path + query)

```yaml
parameters:
  - name: petId
    in: path
    required: true
    schema:
      type: string
    description: ID of pet
  - name: limit
    in: query
    schema:
      type: integer
      format: int32
    style: form
    explode: true
```

## Key points

- Parameter MUST have either `content` or `schema`, not both.
- Path params: required = true; name must match path template.
- Header/cookie with schema: do not apply URI percent-encoding; see spec for quoting/escaping.

<!--
Source references:
- https://github.com/OAI/OpenAPI-Specification/blob/main/versions/3.2.0.md
-->
