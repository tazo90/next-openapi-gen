---
name: advanced-base-uri-and-resolution
description: Base URI, $self, and reference resolution in OpenAPI 3.2
---

# Base URI and Reference Resolution

Relative URI references in an OAD are resolved using the appropriate **base URI**. Resolution follows RFC3986 (and for Schema Objects, JSON Schema draft 2020-12 Section 8.2).

## Base URI sources (priority)

1. **Within content:** For the OpenAPI document, the OpenAPI Object's **$self** field. For Schema Objects, the **$id** (or nearest containing schema's $id). Highest precedence.
2. **Encapsulating entity:** If no base in content, any encapsulating entity (e.g. OpenAPI doc encapsulating a schema; or OAD embedded in another format).
3. **Retrieval URI:** If no base in content or encapsulating entity, the URI from which the document was retrieved. Implementations MAY support document retrieval; all implementations SHOULD allow users to supply documents with intended retrieval URIs so references can be resolved without network retrieval.
4. **Application-specific default:** If none of the above apply.

If **$self** is a relative URI reference, it is resolved against the next possible base URI source before being used for resolving other relative references.

## When $self is present

- Use the document's **$self** URI as the base for reference resolution for interoperability.
- Implementations MUST support resolving API description URIs using the URI defined by $self when present.
- Supporting other URIs (e.g. retrieval URI) when $self is present is implementation-defined; relying on it is NOT RECOMMENDED.

## Parsing and resolution

- **Full parsing:** All documents in an OAD MUST be fully parsed to locate reference targets before treating any reference as unresolvable. Implementations MUST NOT treat a reference as unresolvable before completely parsing all provided OAD documents.
- **Fragment:** If a URI contains a fragment, resolve per the referenced document's fragment mechanism. For JSON/YAML documents, fragment SHOULD be interpreted as JSON Pointer (RFC6901).
- **Implicit connections:** Components/Tag names and operationId resolution in multi-document OADs are implementation-defined within spec constraints; RECOMMENDED to resolve from entry document (Components, Tags) or consider all Operation Objects (operationId). Use URI-based alternatives (e.g. operationRef) when possible for interoperability.

## Schema $id and $ref

- Schema Objects may have **$id**; it establishes base URI for that schema and subschemas. Reference Schema Objects by the nearest $id for the non-fragment part when crossing $id boundaries for interoperability.
- JSON Pointer in fragments: use `~1` for `/` and `%7B`/`%7D` for `{`/`}` in URI fragments.

## Key points

- Set **$self** when using multi-document OADs or when the document may be served from different locations.
- Provide documents with intended retrieval URIs when retrieval is not used, so resolution is deterministic.
- Avoid fragmentary parsing; parse full documents before resolving references.

<!--
Source references:
- https://github.com/OAI/OpenAPI-Specification/blob/main/versions/3.2.0.md (Appendix F, G, Relative References)
-->
