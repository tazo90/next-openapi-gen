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

  it("emits 3.3-preview as an experimental 3.2-compatible document version", () => {
    const finalized = getOpenApiVersionProcessor("3.3-preview").finalize(
      createDocumentFromTemplate({
        openapi: "3.2.0",
        $self: "https://example.com/openapi.json",
        info: {
          title: "Fixture",
          version: "1.0.0",
        },
        paths: {},
      }),
    );

    expect(finalized.openapi).toBe("3.3-preview");
    expect(finalized.$self).toBe("https://example.com/openapi.json");
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
      "x-jsonschema-contentEncoding": "base64",
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
      "x-jsonschema-propertyNames": { type: "string", pattern: "^[a-z]+$" },
      "x-jsonschema-patternProperties": { "^x-": { type: "string" } },
      "x-jsonschema-dependentSchemas": { a: { required: ["b"] } },
      "x-jsonschema-unevaluatedProperties": false,
      "x-jsonschema-contentSchema": { type: "object" },
    });
  });

  it("downgrades tuple schemas to valid OpenAPI 3.0 array item schemas", () => {
    const finalized = getOpenApiVersionProcessor("3.0").finalize(
      createDocumentFromTemplate({
        openapi: "3.2.0",
        info: { title: "Fixture", version: "1.0.0" },
        components: {
          schemas: {
            Tupled: {
              type: "array",
              prefixItems: [{ type: "string" }, { type: "number" }],
              items: false,
              minItems: 2,
              maxItems: 2,
            },
            RestTupled: {
              type: "array",
              prefixItems: [{ type: "string" }],
              items: { type: "number" },
              minItems: 1,
            },
          },
        },
      }),
    );

    expect(finalized.components?.schemas?.Tupled).toEqual({
      type: "array",
      items: {
        oneOf: [{ type: "string" }, { type: "number" }],
      },
      minItems: 2,
      maxItems: 2,
    });
    expect(finalized.components?.schemas?.RestTupled).toEqual({
      type: "array",
      items: {
        oneOf: [{ type: "string" }, { type: "number" }],
      },
      minItems: 1,
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
    expect(finalized31["x-oai-$self"]).toBe("https://example.com/openapi.json");
    expect(finalized31.servers?.[0]).not.toHaveProperty("name");
    expect(finalized31.servers?.[0]).toMatchObject({ "x-oai-name": "production" });
    expect(finalized31.tags?.[0]).not.toHaveProperty("summary");
    expect(finalized31.paths?.["/search"]?.get?.parameters?.[0]).toMatchObject({
      in: "query",
    });
    expect(
      finalized31.paths?.["/search"]?.get?.responses?.["200"] &&
        "content" in finalized31.paths["/search"].get.responses["200"]
        ? finalized31.paths["/search"].get.responses["200"].content?.["text/event-stream"]
        : undefined,
    ).toMatchObject({
      "x-oai-itemSchema": {
        type: "object",
        properties: {
          id: { type: "string" },
        },
      },
    });
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
        "x-oai-dataValue": {
          id: "evt_1",
        },
      },
      wire: {
        "x-oai-serializedValue": 'data: {"id":"evt_1"}\n\n',
      },
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
        },
      });

    const finalized32 = getOpenApiVersionProcessor("3.2").finalize(document());
    expect(finalized32.components?.mediaTypes).toBeDefined();

    const finalized31 = getOpenApiVersionProcessor("3.1").finalize(document());
    expect(finalized31.components?.mediaTypes).toBeUndefined();

    const finalized30 = getOpenApiVersionProcessor("3.0").finalize(document());
    expect(finalized30.components?.mediaTypes).toBeUndefined();
  });

  it("covers leftover 3.1 upgrade and 3.0 downgrade schema branches", () => {
    const document = () =>
      createDocumentFromTemplate({
        openapi: "3.2.0",
        info: { title: "Fixture", version: "1.0.0" },
        paths: {
          "/upload": {
            post: {
              requestBody: {
                content: {
                  "multipart/form-data": {
                    schema: {
                      type: "object",
                      properties: {
                        file: { type: "string", format: "binary" },
                      },
                    },
                  },
                  "text/plain": {
                    schema: { type: "string", format: "binary" },
                  },
                },
              },
              responses: {
                "200": {
                  description: "ok",
                  content: {
                    "application/json": {
                      schema: {
                        nullable: true,
                        exclusiveMinimum: false,
                        exclusiveMaximum: false,
                        minimum: 1,
                        maximum: 10,
                        if: { type: "string" },
                        // OpenAPI JSON Schema uses `then` as a keyword, not a thenable.
                        // eslint-disable-next-line unicorn/no-thenable -- OpenAPI if/then/else
                        then: { type: "string" },
                        else: { type: "number" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        components: {
          schemas: {
            Exclusive: {
              type: "number",
              exclusiveMinimum: 1,
              exclusiveMaximum: 10,
              minimum: 5,
              maximum: 4,
            },
            NullableArray: {
              nullable: true,
              type: ["string"],
            },
            ExclusiveBounds: {
              type: "number",
              exclusiveMinimum: true,
              exclusiveMaximum: true,
              minimum: 2,
              maximum: 8,
            },
            Binary: {
              type: "string",
              contentMediaType: "application/octet-stream",
            },
            Tuple: {
              prefixItems: [{ type: "string" }, { type: "number" }],
            },
          },
        },
      });

    const upgraded = getOpenApiVersionProcessor("3.1").finalize(document());
    expect(upgraded.components?.schemas?.NullableArray).toMatchObject({
      type: expect.arrayContaining(["string", "null"]),
    });
    expect(upgraded.components?.schemas?.ExclusiveBounds).toMatchObject({
      exclusiveMinimum: 2,
      exclusiveMaximum: 8,
    });
    const upload31 = upgraded.paths?.["/upload"]?.post;
    const multipart =
      upload31?.requestBody && "content" in upload31.requestBody
        ? upload31.requestBody.content?.["multipart/form-data"]?.schema
        : undefined;
    const plain =
      upload31?.requestBody && "content" in upload31.requestBody
        ? upload31.requestBody.content?.["text/plain"]?.schema
        : undefined;
    expect(multipart).toMatchObject({
      properties: {
        file: { type: "string", contentMediaType: "application/octet-stream" },
      },
    });
    expect(plain).toMatchObject({
      type: "string",
      contentMediaType: "text/plain",
    });

    const downgraded = getOpenApiVersionProcessor("3.0").finalize(document());
    expect(downgraded.components?.schemas?.Exclusive).toMatchObject({
      type: "number",
      minimum: 5,
      maximum: 4,
    });
    expect(downgraded.components?.schemas?.Exclusive).not.toHaveProperty("exclusiveMinimum");
    expect(downgraded.components?.schemas?.Exclusive).not.toHaveProperty("exclusiveMaximum");
  });

  it("moves and promotes license identifiers across versions", () => {
    const withLicense = {
      openapi: "3.1.0",
      info: {
        title: "License",
        version: "1.0.0",
        license: { name: "MIT", identifier: "MIT" },
      },
      paths: {},
    };
    const downgraded = getOpenApiVersionProcessor("3.0").finalize(withLicense);
    expect(downgraded.info?.license).toMatchObject({
      name: "MIT",
      "x-oai-license-identifier": "MIT",
    });
    expect(downgraded.info?.license).not.toHaveProperty("identifier");

    const upgraded = getOpenApiVersionProcessor("3.1").finalize({
      openapi: "3.0.0",
      info: {
        title: "License",
        version: "1.0.0",
        license: { name: "MIT", "x-oai-license-identifier": "MIT" },
      },
      paths: {},
    });
    expect(upgraded.info?.license).toMatchObject({
      name: "MIT",
      identifier: "MIT",
    });
  });

  it("covers leftover path-item query and additionalOperations promotion", () => {
    const document = {
      openapi: "3.2.0",
      info: { title: "Paths", version: "1.0.0" },
      paths: {
        "/invalid": "not-a-path-item",
        "/ops": {
          parameters: [{ name: "q", in: "query", schema: { type: "string" } }],
          additionalOperations: {
            purge: { responses: { "204": { description: "gone" } } },
          },
          query: { responses: { "200": { description: "query" } } },
          get: { responses: { "200": { description: "ok" } } },
        },
        "/promote": {
          "x-oai-additionalOperations": {
            query: { responses: { "200": { description: "promoted-query" } } },
            purge: { responses: { "204": { description: "promoted-purge" } } },
          },
        },
      },
    };

    const for30 = getOpenApiVersionProcessor("3.0").finalize(document as never);
    expect(for30.paths?.["/invalid"]).toEqual({});
    expect(for30.paths?.["/ops"]).toMatchObject({
      "x-oai-additionalOperations": expect.objectContaining({
        query: expect.any(Object),
        purge: expect.any(Object),
      }),
    });
    expect(for30.paths?.["/ops"]).not.toHaveProperty("query");
    expect(for30.paths?.["/ops"]).not.toHaveProperty("additionalOperations");

    const for32 = getOpenApiVersionProcessor("3.2").finalize(document as never);
    expect(for32.paths?.["/promote"]).toMatchObject({
      query: expect.objectContaining({
        responses: { "200": { description: "promoted-query" } },
      }),
    });

    const withInvalidExtension = getOpenApiVersionProcessor("3.0").finalize({
      openapi: "3.2.0",
      info: { title: "Paths", version: "1.0.0" },
      paths: {
        "/ops": {
          query: { responses: { "200": { description: "query" } } },
          additionalOperations: {
            purge: { responses: { "204": { description: "gone" } } },
          },
          "x-oai-additionalOperations": "not-a-record",
          get: { responses: { "200": { description: "ok" } } },
        },
      },
    });
    expect(withInvalidExtension.paths?.["/ops"]).toMatchObject({
      "x-oai-additionalOperations": expect.objectContaining({
        query: expect.any(Object),
        purge: expect.any(Object),
      }),
    });

    const for32Merge = getOpenApiVersionProcessor("3.2").finalize({
      openapi: "3.2.0",
      info: { title: "Paths", version: "1.0.0" },
      paths: {
        "/merge": {
          query: { responses: { "200": { description: "existing-query" } } },
          additionalOperations: {
            existing: { responses: { "204": { description: "kept" } } },
          },
          "x-oai-additionalOperations": {
            query: { responses: { "200": { description: "ignored-query" } } },
            purge: { responses: { "204": { description: "promoted-purge" } } },
            skip: undefined,
          },
          get: "not-an-operation",
        },
        "/empty-extension": {
          "x-oai-additionalOperations": {
            query: { responses: { "200": { description: "only-query" } } },
          },
        },
      },
    } as never);
    expect(for32Merge.paths?.["/merge"]).toMatchObject({
      query: { responses: { "200": { description: "existing-query" } } },
      additionalOperations: expect.objectContaining({
        existing: expect.any(Object),
        purge: expect.any(Object),
      }),
    });
    expect(for32Merge.paths?.["/merge"]?.get).toEqual({});
    expect(for32Merge.paths?.["/empty-extension"]).toMatchObject({
      query: expect.any(Object),
    });
    expect(for32Merge.paths?.["/empty-extension"]).not.toHaveProperty("x-oai-additionalOperations");
  });

  it("covers leftover operation, media, security, and example transforms", () => {
    const document = {
      openapi: "3.2.0",
      info: { title: "Ops", version: "1.0.0" },
      paths: {
        "/ops": {
          get: {
            parameters: [
              "not-a-parameter",
              {
                name: "q",
                in: "querystring",
                schema: { type: "string" },
                content: {
                  "application/json": { schema: { type: "string" } },
                  "text/plain": { $ref: "#/components/schemas/Plain" },
                },
                examples: {
                  a: { value: "x" },
                  b: "not-an-example",
                  c: { $ref: "#/components/examples/C" },
                },
              },
            ],
            requestBody: { $ref: "#/components/requestBodies/Create" },
            responses: {
              "200": {
                description: "ok",
                content: {
                  "application/json": { schema: { type: "object" } },
                  "text/plain": { $ref: "#/components/schemas/Plain" },
                },
              },
              "204": "not-a-response",
            },
            callbacks: {
              onEvent: {
                "{$request.body#/callback}": {
                  post: { responses: { "200": { description: "ok" } } },
                },
              },
            },
          },
          post: {
            requestBody: "not-a-body",
            responses: { "201": { description: "created" } },
          },
        },
      },
      components: {
        securitySchemes: {
          bearer: { type: "http", scheme: "bearer", deprecated: true },
          invalid: "not-a-scheme",
        },
        examples: {
          a: { value: "x" },
          b: "not-an-example",
          c: { $ref: "#/components/examples/C" },
        },
      },
    };

    const for30 = getOpenApiVersionProcessor("3.0").finalize(document as never);
    expect(for30.paths?.["/ops"]?.get?.parameters?.[0]).toBe("not-a-parameter");
    expect(for30.paths?.["/ops"]?.get?.parameters?.[1]).toMatchObject({ in: "query" });
    expect(for30.paths?.["/ops"]?.get?.requestBody).toEqual({
      $ref: "#/components/requestBodies/Create",
    });
    expect(for30.paths?.["/ops"]?.post?.requestBody).toBe("not-a-body");
    expect(for30.paths?.["/ops"]?.get?.responses?.["204"]).toBe("not-a-response");
    expect(for30.components?.securitySchemes?.invalid).toBe("not-a-scheme");
  });
});

type OpenApiSchemaWithDiscriminator = {
  discriminator?: {
    propertyName: string;
    mapping?: Record<string, string>;
    defaultMapping?: string;
  };
};
