import { describe, expect, it } from "vitest";

import { createDocumentFromTemplate } from "@workspace/openapi-core/openapi/document.js";
import { getOpenApiVersionProcessor } from "@workspace/openapi-core/openapi/version-processor.js";

describe("OpenAPI version processor", () => {
  it("finalizes public specs without leaking generator config", () => {
    const document = createDocumentFromTemplate({
      openapi: "3.0.0",
      openapiVersion: "3.2",
      info: {
        title: "Fixture",
        version: "1.0.0",
        description: "Fixture",
      },
      paths: {},
      apiDir: "./src/app/api",
      schemaDir: "./src",
      schemaType: "zod",
      outputDir: "./public",
      outputFile: "openapi.json",
      docsUrl: "api-docs",
      ui: "scalar",
      includeOpenApiRoutes: false,
      debug: false,
    });

    const finalized = getOpenApiVersionProcessor("3.2").finalize(document);

    expect(finalized.openapi).toBe("3.2.0");
    expect(finalized).not.toHaveProperty("apiDir");
    expect(finalized).not.toHaveProperty("schemaType");
    expect(finalized).toHaveProperty("paths");
  });

  it("upgrades shared schema shapes to OpenAPI 3.1 semantics", () => {
    const finalized = getOpenApiVersionProcessor("3.1").finalize(
      createDocumentFromTemplate({
        openapi: "3.0.0",
        info: {
          title: "Fixture",
          version: "1.0.0",
        },
        components: {
          schemas: {
            NullableProfile: {
              type: "string",
              nullable: true,
              example: "fedora",
              minimum: 7,
              exclusiveMinimum: true,
              format: "base64",
            },
            UploadPart: {
              type: "string",
              format: "binary",
            },
          },
        },
      }),
    );

    expect(finalized.components?.schemas?.NullableProfile).toEqual({
      type: ["string", "null"],
      examples: ["fedora"],
      exclusiveMinimum: 7,
      contentEncoding: "base64",
    });
    expect(finalized.components?.schemas?.UploadPart).toEqual({
      type: "string",
      contentMediaType: "application/octet-stream",
    });
  });

  it("downgrades 3.1+ schema shapes back to OpenAPI 3.0 semantics", () => {
    const finalized = getOpenApiVersionProcessor("3.0").finalize(
      createDocumentFromTemplate({
        openapi: "3.2.0",
        info: {
          title: "Fixture",
          version: "1.0.0",
        },
        components: {
          schemas: {
            NullableProfile: {
              type: ["string", "null"],
              examples: ["fedora"],
              exclusiveMinimum: 7,
              contentEncoding: "base64",
            },
          },
        },
      }),
    );

    expect(finalized.components?.schemas?.NullableProfile).toEqual({
      type: "string",
      nullable: true,
      example: "fedora",
      minimum: 7,
      exclusiveMinimum: true,
      format: "base64",
    });
  });

  it("strips JSON Schema 2020-12 keywords unsupported by OpenAPI 3.0", () => {
    const finalized = getOpenApiVersionProcessor("3.0").finalize(
      createDocumentFromTemplate({
        openapi: "3.2.0",
        info: { title: "Fixture", version: "1.0.0" },
        components: {
          schemas: {
            TypedMap: {
              type: "object",
              additionalProperties: { type: "number" },
              propertyNames: { type: "string", pattern: "^[a-z]+$" },
              patternProperties: { "^x-": { type: "string" } },
              dependentSchemas: { a: { required: ["b"] } },
              dependentRequired: { a: ["b"] },
              unevaluatedProperties: false,
              contentSchema: { type: "object" },
              $defs: { Nested: { type: "string" } },
            },
          },
        },
      }),
    );

    expect(finalized.components?.schemas?.TypedMap).toEqual({
      type: "object",
      additionalProperties: { type: "number" },
    });
  });

  it("preserves 3.2-only features and strips them for older versions", () => {
    const document = createDocumentFromTemplate({
      openapi: "3.2.0",
      info: {
        title: "Fixture",
        version: "1.0.0",
      },
      $self: "https://example.com/openapi.json",
      servers: [
        {
          url: "https://example.com",
          description: "Primary",
          name: "production",
        },
      ],
      tags: [
        {
          name: "events",
          summary: "Events",
          kind: "nav",
        },
        {
          name: "streaming",
          parent: "events",
        },
      ],
      paths: {
        "/search": {
          get: {
            operationId: "get-search",
            tags: ["events"],
            parameters: [
              {
                name: "advancedQuery",
                in: "querystring",
                content: {
                  "application/x-www-form-urlencoded": {
                    schema: {
                      type: "object",
                      properties: {
                        search: { type: "string" },
                      },
                    },
                  },
                },
              },
            ],
            responses: {
              200: {
                description: "Search stream",
                content: {
                  "text/event-stream": {
                    itemSchema: {
                      type: "object",
                      properties: {
                        id: { type: "string" },
                      },
                    },
                    examples: {
                      structured: {
                        dataValue: {
                          id: "evt_1",
                        },
                      },
                      wire: {
                        serializedValue: 'data: {"id":"evt_1"}\n\n',
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      components: {
        securitySchemes: {
          DeviceOAuth: {
            type: "oauth2",
            oauth2MetadataUrl: "https://example.com/.well-known/oauth-authorization-server",
            flows: {
              deviceAuthorization: {
                deviceAuthorizationUrl: "https://example.com/oauth/device",
                tokenUrl: "https://example.com/oauth/token",
                scopes: {
                  "events:read": "Read event streams",
                },
              },
            },
          },
        },
      },
    });

    const finalized32 = getOpenApiVersionProcessor("3.2").finalize(document);
    expect(finalized32.$self).toBe("https://example.com/openapi.json");
    expect(finalized32.servers?.[0]).toHaveProperty("name", "production");
    expect(finalized32.tags?.[0]).toHaveProperty("summary", "Events");
    expect(finalized32.paths?.["/search"]?.get?.parameters?.[0]).toMatchObject({
      in: "querystring",
    });
    expect(
      finalized32.paths?.["/search"]?.get?.responses?.["200"] &&
        "content" in finalized32.paths["/search"].get.responses["200"]
        ? finalized32.paths["/search"].get.responses["200"].content?.["text/event-stream"]
        : undefined,
    ).toHaveProperty("itemSchema");
    expect(
      finalized32.paths?.["/search"]?.get?.responses?.["200"] &&
        "content" in finalized32.paths["/search"].get.responses["200"]
        ? finalized32.paths["/search"].get.responses["200"].content?.["text/event-stream"]?.examples
        : undefined,
    ).toMatchObject({
      structured: {
        dataValue: {
          id: "evt_1",
        },
      },
      wire: {
        serializedValue: 'data: {"id":"evt_1"}\n\n',
      },
    });
    expect(finalized32.components?.securitySchemes?.DeviceOAuth).toMatchObject({
      oauth2MetadataUrl: "https://example.com/.well-known/oauth-authorization-server",
    });

    const finalized31 = getOpenApiVersionProcessor("3.1").finalize(document);
    expect(finalized31).not.toHaveProperty("$self");
    expect(finalized31.servers?.[0]).not.toHaveProperty("name");
    expect(finalized31.tags?.[0]).not.toHaveProperty("summary");
    expect(finalized31.paths?.["/search"]?.get?.parameters?.[0]).toMatchObject({
      in: "query",
    });
    expect(
      finalized31.paths?.["/search"]?.get?.responses?.["200"] &&
        "content" in finalized31.paths["/search"].get.responses["200"]
        ? finalized31.paths["/search"].get.responses["200"].content?.["text/event-stream"]
        : undefined,
    ).not.toHaveProperty("itemSchema");
    expect(
      finalized31.paths?.["/search"]?.get?.responses?.["200"] &&
        "content" in finalized31.paths["/search"].get.responses["200"]
        ? finalized31.paths["/search"].get.responses["200"].content?.["text/event-stream"]?.examples
        : undefined,
    ).toMatchObject({
      structured: {
        value: {
          id: "evt_1",
        },
      },
      wire: {},
    });
    expect(finalized31.components?.securitySchemes?.DeviceOAuth).not.toHaveProperty(
      "oauth2MetadataUrl",
    );
  });

  it("downgrades OpenAPI 3.2 operation-level callbacks and webhooks for older versions", () => {
    const documentWithCallbacks = () =>
      createDocumentFromTemplate({
        openapi: "3.2.0",
        info: { title: "Fixture", version: "1.0.0" },
        paths: {
          "/subscribe": {
            post: {
              operationId: "post-subscribe",
              tags: ["events"],
              responses: {
                "2XX": { description: "Accepted" },
              },
              callbacks: {
                onEvent: {
                  "{$request.body#callbackUrl}": {
                    post: {
                      operationId: "callback-onEvent",
                      responses: { "200": { description: "OK" } },
                    },
                  },
                },
              },
            },
          },
        },
        webhooks: {
          newEvent: {
            post: {
              operationId: "webhook-newEvent",
              responses: { "200": { description: "OK" } },
            },
          },
        },
      });

    const finalized32 = getOpenApiVersionProcessor("3.2").finalize(documentWithCallbacks());
    expect(finalized32.webhooks).toBeDefined();
    expect(finalized32.paths?.["/subscribe"]?.post?.callbacks).toBeDefined();

    const finalized31 = getOpenApiVersionProcessor("3.1").finalize(documentWithCallbacks());
    expect(finalized31.webhooks).toBeDefined();
    expect(finalized31.paths?.["/subscribe"]?.post?.callbacks).toBeDefined();

    const finalized30 = getOpenApiVersionProcessor("3.0").finalize(documentWithCallbacks());
    expect(finalized30.webhooks).toBeUndefined();
    expect(finalized30.paths?.["/subscribe"]?.post?.callbacks).toBeDefined();
  });

  it("downgrades const keyword and discriminator.defaultMapping for older versions", () => {
    const document = () =>
      createDocumentFromTemplate({
        openapi: "3.2.0",
        info: { title: "Fixture", version: "1.0.0" },
        components: {
          schemas: {
            Shape: {
              oneOf: [{ $ref: "#/components/schemas/Circle" }],
              discriminator: {
                propertyName: "kind",
                mapping: { circle: "#/components/schemas/Circle" },
                defaultMapping: "#/components/schemas/Shape",
              },
            },
            Kind: {
              type: "string",
              const: "circle",
            },
            Circle: {
              type: "object",
              properties: { kind: { const: "circle" } },
            },
          },
        },
      });

    const finalized32 = getOpenApiVersionProcessor("3.2").finalize(document());
    const shape32 = finalized32.components?.schemas?.Shape as OpenApiSchemaWithDiscriminator;
    expect(shape32.discriminator?.defaultMapping).toBe("#/components/schemas/Shape");
    const kind32 = finalized32.components?.schemas?.Kind as { const?: unknown; enum?: unknown };
    expect(kind32.const).toBe("circle");

    const finalized31 = getOpenApiVersionProcessor("3.1").finalize(document());
    const shape31 = finalized31.components?.schemas?.Shape as OpenApiSchemaWithDiscriminator;
    expect(shape31.discriminator?.defaultMapping).toBeUndefined();
    const kind31 = finalized31.components?.schemas?.Kind as { const?: unknown; enum?: unknown };
    expect(kind31.const).toBe("circle");

    const finalized30 = getOpenApiVersionProcessor("3.0").finalize(document());
    const shape30 = finalized30.components?.schemas?.Shape as OpenApiSchemaWithDiscriminator;
    expect(shape30.discriminator?.defaultMapping).toBeUndefined();
    const kind30 = finalized30.components?.schemas?.Kind as { const?: unknown; enum?: unknown };
    expect(kind30.const).toBeUndefined();
    expect(kind30.enum).toEqual(["circle"]);
  });

  it("strips components.mediaTypes when not supported by target version", () => {
    const document = () =>
      createDocumentFromTemplate({
        openapi: "3.2.0",
        info: { title: "Fixture", version: "1.0.0" },
        components: {
          mediaTypes: {
            Json: { schema: { type: "object" } },
          },
        } as never,
      });

    const finalized32 = getOpenApiVersionProcessor("3.2").finalize(document());
    expect(
      (finalized32.components as Record<string, unknown> | undefined)?.mediaTypes,
    ).toBeDefined();

    const finalized31 = getOpenApiVersionProcessor("3.1").finalize(document());
    expect(
      (finalized31.components as Record<string, unknown> | undefined)?.mediaTypes,
    ).toBeUndefined();

    const finalized30 = getOpenApiVersionProcessor("3.0").finalize(document());
    expect(
      (finalized30.components as Record<string, unknown> | undefined)?.mediaTypes,
    ).toBeUndefined();
  });
});

type OpenApiSchemaWithDiscriminator = {
  discriminator?: {
    propertyName: string;
    mapping?: Record<string, string>;
    defaultMapping?: string;
  };
};
