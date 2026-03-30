---
name: schema-composition-polymorphism
description: Schema composition (allOf, oneOf, anyOf) and polymorphism with discriminator in OpenAPI 3.2
---

# Schema Composition and Polymorphism

OpenAPI 3.2 Schema Object is a superset of JSON Schema Draft 2020-12. Composition uses **allOf**, **oneOf**, and **anyOf**. Polymorphism is supported via the [Discriminator Object](core-discriminator-and-xml.md).

## allOf

- **allOf** takes an array of schema definitions; each is validated **independently**; together they compose a single object.
- Use for **model composition** (extending a base schema with additional properties). No implicit hierarchy; all subschemas apply.
- Example: base ErrorModel + additional property rootCause → ExtendedErrorModel.

## oneOf and anyOf

- **oneOf:** Exactly **one** of the subschemas must be valid.
- **anyOf:** At least **one** of the subschemas must be valid.
- Use for **polymorphism** (payload is one of several types). Validation is independent per subschema.
- Deserialization can be costly (determining which schema matches); use **discriminator** as a hint to improve efficiency and error messaging. Discriminator MUST NOT change the validation outcome.

## Discriminator

- **discriminator** indicates the property name that hints which schema (in oneOf/anyOf or referenced via allOf) is expected to validate the payload.
- Legal only with **oneOf**, **anyOf**, or **allOf**. With oneOf/anyOf, all possible schemas MUST be listed explicitly. With allOf, discriminator can be on parent; children built via allOf are alternatives (non-validation use; validation with parent does not search child schemas).
- **propertyName:** REQUIRED. Name of property in payload holding the discriminating value.
- **mapping:** Payload value → schema name or URI. If absent, value of property = schema name in Components.
- **defaultMapping:** REQUIRED when discriminating property is optional; schema to use when property is absent or value has no mapping.

See [core-discriminator-and-xml](core-discriminator-and-xml.md) for Discriminator Object fields and examples.

## Example (oneOf + discriminator)

```yaml
MyResponseType:
  oneOf:
    - $ref: '#/components/schemas/Cat'
    - $ref: '#/components/schemas/Dog'
    - $ref: '#/components/schemas/Lizard'
  discriminator:
    propertyName: petType
```

Payload `{"id": 1, "petType": "Cat"}` hints Cat schema.

## Example (allOf + discriminator)

```yaml
components:
  schemas:
    Pet:
      type: object
      required: [petType]
      properties:
        petType: { type: string }
      discriminator:
        propertyName: petType
        mapping:
          dog: Dog
    Cat:
      allOf:
        - $ref: '#/components/schemas/Pet'
        - type: object
          properties:
            name: { type: string }
    Dog:
      allOf:
        - $ref: '#/components/schemas/Pet'
        - type: object
          properties:
            bark: { type: string }
```

## Key points

- allOf = compose; oneOf = exactly one; anyOf = at least one. All validate subschemas independently.
- Use discriminator as a hint for serialization/deserialization; it cannot change validation result.
- Optional discriminating property requires defaultMapping; subschemas with mapped values should require the property.

<!--
Source references:
- https://github.com/OAI/OpenAPI-Specification/blob/main/versions/3.2.0.md
-->
