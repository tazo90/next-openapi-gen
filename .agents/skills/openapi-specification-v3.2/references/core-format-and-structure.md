---
name: core-format-and-structure
description: Format, JSON/YAML, case sensitivity, OAD structure, and parsing for OpenAPI 3.2
---

# Format and Structure

OpenAPI documents are JSON objects, representable in JSON or YAML. Field names are **case-sensitive** unless explicitly noted (e.g. HTTP-derived names follow HTTP rules).

## JSON and YAML

- YAML 1.2 is RECOMMENDED; round-trip with JSON per RFC9512 Section 3.4.
- OAD authors SHOULD NOT rely on JSON-incompatible YAML values.

## Rich text

- `description` fields support CommonMark markdown (minimum: CommonMark 0.27). Tooling that renders rich text MUST support at least that.

## OpenAPI Description (OAD) structure

- An OAD may be a single document or multiple documents connected by URI references and implicit connections.
- Every document in an OAD MUST have either an OpenAPI Object or a Schema Object at the root and MUST be parsed as a complete document.
- The document where parsing begins (with the OpenAPI Object) is the **entry document**. RECOMMENDED names: `openapi.json` or `openapi.yaml`.

## Parsing and references

- All documents MUST be fully parsed to locate reference targets (including JSON Schema requirements with OAS base URI rules).
- Implementations MUST NOT treat a reference as unresolvable before parsing all provided OAD documents.
- Relative URI references use the appropriate base URI (RFC3986; for Schema, JSON Schema draft 2020-12 Section 8.2). If `$self` is relative, it is resolved first, then used for other relative references.
- Common base URI when `$self` is missing or relative: retrieval URI. Implementations SHOULD allow supplying documents with intended retrieval URIs so references can be resolved without network retrieval.

## Key points

- All field names are case-sensitive except where HTTP dictates otherwise.
- Patterned fields MUST have unique names within the containing object.
- Fragments in URIs: for JSON/YAML documents, fragment SHOULD be interpreted as JSON Pointer (RFC6901).

<!--
Source references:
- https://github.com/OAI/OpenAPI-Specification/blob/main/versions/3.2.0.md
-->
