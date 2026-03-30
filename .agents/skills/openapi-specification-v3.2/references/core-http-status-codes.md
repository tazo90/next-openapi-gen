---
name: core-http-status-codes
description: HTTP status codes as response keys and default in OpenAPI 3.2
---

# HTTP Status Codes

Response keys in the [Responses Object](responses.md) are HTTP status codes. Status codes SHOULD be selected from the [IANA HTTP Status Code Registry](https://www.iana.org/assignments/http-status-codes/http-status-codes.xhtml).

## Usage in Responses Object

- **Keys:** Any valid HTTP status code as property name (e.g. `"200"`, `"201"`, `"400"`, `"404"`, `"500"`). **One property per code.** Keys MUST be enclosed in quotation marks for JSON/YAML compatibility.
- **default:** Fixed key for responses other than those declared for specific codes. Use for generic error or fallback documentation.
- **Range with X:** To define a range, the field MAY contain uppercase wildcard `X`. Allowed: `1XX`, `2XX`, `3XX`, `4XX`, `5XX` (e.g. `2XX` = 200–299). If both an explicit code (e.g. `"200"`) and a range (e.g. `2XX`) are present, the explicit code takes precedence for that code.
- **At least one** response code MUST be present per operation. SHOULD document a success response (e.g. 200 or 201).

## Example

```yaml
responses:
  "200":
    description: Success
    content:
      application/json:
        schema:
          $ref: '#/components/schemas/Pet'
  "400":
    description: Bad request
    content:
      application/json:
        schema:
          $ref: '#/components/schemas/Error'
  "404":
    $ref: '#/components/responses/NotFound'
  default:
    description: Unexpected error
    content:
      application/json:
        schema:
          $ref: '#/components/schemas/Error'
```

## Key points

- Use `default` to cover unspecified status codes (e.g. 5xx or unknown errors).
- Document at least one success response; tools and clients rely on it.
- Status code keys are strings in the spec (e.g. `"200"` in JSON, `'200'` in YAML).

<!--
Source references:
- https://github.com/OAI/OpenAPI-Specification/blob/main/versions/3.2.0.md
-->
