import { describe, expect, it } from "vitest";

import { generateFixtureSpec, getProjectFixturePath } from "../../helpers/test-project.js";

const openApiVersions = ["3.0", "3.1", "3.2"] as const;

const zodFullCoverageFixture = getProjectFixturePath("next", "app-router", "zod-full-coverage");
const typescriptFullCoverageFixture = getProjectFixturePath(
  "next",
  "app-router",
  "ts-full-coverage",
);

describe("full coverage fixture generation", () => {
  it.each(openApiVersions)("wires representative Zod schemas for OpenAPI %s", (openapiVersion) => {
    const { project, spec } = generateFixtureSpec({
      fixturePath: zodFullCoverageFixture,
      openapiVersion,
    });

    try {
      const schemas = spec.components?.schemas ?? {};

      expect(spec.paths?.["/catalog"]?.get?.responses?.["200"]).toMatchObject({
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/StringFormatsSchema",
            },
          },
        },
      });
      expect(spec.paths?.["/objects"]?.post?.responses?.["201"]).toMatchObject({
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/StrictObject",
            },
          },
        },
      });
      expect(spec.paths?.["/union"]?.get?.responses?.["214"]).toMatchObject({
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/Branded",
            },
          },
        },
      });
      expect(spec.paths?.["/advanced"]?.get?.responses?.["203"]).toMatchObject({
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/Refined",
            },
          },
        },
      });

      expect(schemas.StringFormatsSchema).toMatchObject({
        type: "object",
        properties: {
          uuid: {
            type: "string",
            format: "uuid",
          },
          email: {
            type: "string",
            format: "email",
          },
          datetime: {
            type: "string",
            format: "date-time",
          },
        },
      });
      expect(schemas.NumberRefinementsSchema).toMatchObject({
        type: "object",
        properties: {
          int: {
            type: "integer",
          },
          bounded: {
            type: "number",
            minimum: 0,
            maximum: 100,
          },
          step: {
            type: "number",
            multipleOf: 0.5,
          },
        },
      });
      expect(schemas.CollectionsSchema).toMatchObject({
        type: "object",
        properties: {
          bounded: {
            type: "array",
            minItems: 1,
            maxItems: 5,
          },
          set: {
            type: "array",
            uniqueItems: true,
          },
          map: {
            type: "object",
            additionalProperties: {
              type: "number",
            },
          },
        },
      });
      expect(schemas.StrictObject).toMatchObject({
        type: "object",
        additionalProperties: false,
      });
      expect(schemas.CatchAllObject).toMatchObject({
        type: "object",
        additionalProperties: {
          type: "string",
        },
      });
      expect(schemas.ExtendedObject).toMatchObject({
        type: "object",
        properties: {
          createdAt: {
            type: "string",
            format: "date-time",
          },
        },
      });
      expect(schemas.Pet).toMatchObject({
        oneOf: [{ $ref: "#/components/schemas/Cat" }, { $ref: "#/components/schemas/Dog" }],
        discriminator: {
          propertyName: "kind",
        },
      });
      expect(schemas.ColorEnum).toMatchObject({
        type: "string",
        enum: ["red", "green", "blue"],
      });
      expect(schemas.Described).toMatchObject({
        type: "number",
        description: "A score between 0 and 100",
      });
      expect(schemas.LazyTree).toMatchObject({
        type: "object",
        properties: {
          value: {
            type: "string",
          },
          children: {
            type: "array",
          },
        },
      });
      expect(schemas.Transformed).toMatchObject({
        type: "string",
      });
      expect(schemas.Refined).toMatchObject({
        type: "number",
      });

      const expectedNullableScalar =
        openapiVersion === "3.0"
          ? {
              type: "string",
              nullable: true,
            }
          : {
              type: ["string", "null"],
            };
      expect(schemas.NullableScalar).toMatchObject(expectedNullableScalar);
    } finally {
      project.cleanup();
    }
  });

  it.each(openApiVersions)(
    "wires representative TypeScript schemas for OpenAPI %s",
    (openapiVersion) => {
      const { project, spec } = generateFixtureSpec({
        fixturePath: typescriptFullCoverageFixture,
        openapiVersion,
      });

      try {
        const schemas = spec.components?.schemas ?? {};

        expect(spec.paths?.["/collections"]?.get?.responses?.["203"]).toMatchObject({
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/FixedTuple",
              },
            },
          },
        });
        expect(spec.paths?.["/utilities"]?.get?.responses?.["214"]).toMatchObject({
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/AwaitedPromise",
              },
            },
          },
        });
        expect(spec.paths?.["/utilities"]?.post?.responses?.["202"]).toMatchObject({
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/UpperChannel",
              },
            },
          },
        });

        expect(schemas.Primitives).toMatchObject({
          type: "object",
          properties: {
            str: {
              type: "string",
            },
            num: {
              type: "number",
            },
            literalNum: {
              type: "number",
              enum: [42],
            },
          },
        });
        expect(schemas.ArrayOfStrings).toMatchObject({
          type: "array",
          items: {
            type: "string",
          },
        });
        expect(schemas.ReadonlyNumbers).toMatchObject({
          type: "array",
          items: {
            type: "number",
          },
        });
        expect(schemas.FixedTuple).toMatchObject({
          type: "array",
          minItems: 3,
          maxItems: 3,
        });
        expect(schemas.StringMap).toMatchObject({
          type: "object",
          additionalProperties: {
            type: "string",
          },
        });
        expect(schemas.Mixed).toMatchObject({
          type: "object",
          properties: {
            id: {
              type: "string",
            },
          },
          additionalProperties: {
            type: "string",
          },
        });
        expect(schemas.Picked).toMatchObject({
          type: "object",
          properties: {
            id: {
              type: "string",
            },
            name: {
              type: "string",
            },
          },
        });
        expect(schemas.Partialed).toMatchObject({
          type: "object",
          properties: {
            id: {
              type: "string",
            },
            name: {
              type: "string",
            },
            age: {
              type: "number",
            },
          },
        });
        expect(schemas.Requireed).toMatchObject({
          type: "object",
          required: ["id", "name", "age"],
        });
        expect(schemas.ExcludedUnion).toMatchObject({
          type: "string",
          enum: ["a", "c"],
        });
        expect(schemas.ExtractedUnion).toMatchObject({
          type: "string",
          enum: ["a", "b"],
        });
        expect(schemas.AwaitedPromise).toMatchObject({
          type: "number",
        });
        expect(schemas.Versioned).toMatchObject({
          type: "string",
          enum: ["v1", "v2"],
        });
        expect(schemas.UpperChannel).toMatchObject({
          type: "string",
          enum: ["RED", "GREEN", "BLUE"],
        });
      } finally {
        project.cleanup();
      }
    },
  );
});
