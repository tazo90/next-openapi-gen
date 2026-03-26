---
name: responses
description: Responses Object and Response Object in OpenAPI 3.2
---

# Responses

## Responses Object

Container for expected responses of an operation. Maps HTTP response code to response. MUST contain at least one response code; if only one, it SHOULD be for success.

| Field    | Type   | Description |
|----------|--------|-------------|
| default  | Response \| Reference | Default for codes not covered individually. |
| "1XX"–"5XX" | Response \| Reference | Any HTTP status code as property name (quoted, e.g. "200"). One property per code. |
| "1XX", "2XX", "3XX", "4XX", "5XX" | Response \| Reference | Range: uppercase X; e.g. 2XX = 200–299. Explicit code overrides range for that code. |

## Response Object

| Field        | Type   | Description |
|-------------|--------|-------------|
| summary     | string | Short summary of response meaning. |
| description | string | Description; CommonMark allowed. |
| headers     | Map[string, Header \| Reference] | Header name → definition; case-insensitive. If name is Content-Type, SHALL be ignored. |
| content     | Map[string, Media Type \| Reference] | Media type or range → description; most specific key wins. |
| links       | Map[string, Link \| Reference] | Operation links followable from this response; key = short name per Component naming. |

## Example

```yaml
responses:
  '200':
    description: A pet to be returned
    content:
      application/json:
        schema:
          $ref: '#/components/schemas/Pet'
  default:
    description: Unexpected error
    content:
      application/json:
        schema:
          $ref: '#/components/schemas/ErrorModel'
```

## Example (with headers)

```yaml
description: A simple string response
content:
  text/plain:
    schema:
      type: string
    example: 'whoa!'
headers:
  X-Rate-Limit-Limit:
    description: Allowed requests in current period
    schema:
      type: integer
  X-Rate-Limit-Remaining:
    description: Remaining requests
    schema:
      type: integer
```

## Key points

- At least one response required; document success and known errors.
- Status codes SHOULD come from IANA Status Code Registry.
- Response with no body: omit `content` (e.g. `description: object created`).

<!--
Source references:
- https://github.com/OAI/OpenAPI-Specification/blob/main/versions/3.2.0.md
-->
