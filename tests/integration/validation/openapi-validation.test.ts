import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { Validator } from "@seriousme/openapi-schema-validator";
import { OpenApiGenerator } from "@next-openapi-gen/generator/openapi-generator.js";

import {
  createTempProject,
  generateFixtureSpec,
  getProjectFixturePath,
  writeOpenApiTemplate,
} from "../../helpers/test-project.js";

const appRouterCoreFixture = getProjectFixturePath("next", "app-router", "core-flow");
const appRouterZodCoverageFixture = getProjectFixturePath(
  "next",
  "app-router",
  "zod-only-coverage",
);

describe("OpenAPI document validation", () => {
  it.each(["3.0", "3.1", "3.2"] as const)(
    "validates generated core-flow fixture for OpenAPI %s",
    async (openapiVersion) => {
      const { project, spec } = generateFixtureSpec({
        fixturePath: appRouterCoreFixture,
        openapiVersion,
      });

      try {
        await expectValidSpec(spec);
      } finally {
        project.cleanup();
      }
    },
  );

  it.each(["3.0", "3.1", "3.2"] as const)(
    "validates generated Zod-heavy fixture for OpenAPI %s",
    async (openapiVersion) => {
      const { project, spec } = generateFixtureSpec({
        fixturePath: appRouterZodCoverageFixture,
        openapiVersion,
      });

      try {
        await expectValidSpec(spec);
      } finally {
        project.cleanup();
      }
    },
  );

  it("validates advanced OpenAPI 3.2 template passthrough features", async () => {
    const project = createTempProject("nxog-openapi-32-validation-");

    try {
      const templatePath = writeOpenApiTemplate(project.root, {
        openapi: "3.2.0",
        $self: "https://example.com/openapi.json",
        jsonSchemaDialect: "https://spec.openapis.org/oas/3.2/dialect/2025-09-17",
        servers: [
          {
            url: "https://api.example.com",
            description: "Production",
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
            summary: "Streaming",
            parent: "events",
            kind: "badge",
          },
        ],
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
                    read_events: "Read event streams",
                  },
                },
              },
            },
          },
        },
        paths: {
          "/search": {
            get: {
              operationId: "get-search",
              tags: ["events", "streaming"],
              parameters: [
                {
                  name: "advancedQuery",
                  in: "querystring",
                  required: false,
                  content: {
                    "application/x-www-form-urlencoded": {
                      schema: {
                        type: "object",
                        properties: {
                          filters: {
                            type: "object",
                            additionalProperties: {
                              type: "string",
                            },
                          },
                          sorting: {
                            type: "array",
                            items: {
                              type: "string",
                            },
                          },
                        },
                      },
                    },
                  },
                },
              ],
              responses: {
                200: {
                  description: "Event stream",
                  content: {
                    "text/event-stream": {
                      itemSchema: {
                        type: "object",
                        properties: {
                          id: {
                            type: "string",
                          },
                        },
                      },
                      examples: {
                        structured: {
                          summary: "Structured example",
                          dataValue: {
                            id: "evt_1",
                          },
                        },
                        wire: {
                          summary: "Serialized example",
                          serializedValue: 'data: {"id":"evt_1"}\\n\\n',
                        },
                      },
                    },
                  },
                },
              },
              security: [
                {
                  DeviceOAuth: ["read_events"],
                },
              ],
            },
          },
        },
      });

      const previousCwd = process.cwd();
      process.chdir(project.root);

      try {
        const spec = new OpenApiGenerator({ templatePath }).generate();

        await expectValidSpec(spec);
        expect(spec.$self).toBe("https://example.com/openapi.json");
        expect(spec.servers?.[0]).toHaveProperty("name", "production");
        expect(spec.tags?.[0]).toHaveProperty("summary", "Events");
        expect(spec.paths?.["/search"]?.get?.parameters?.[0]).toMatchObject({
          in: "querystring",
        });
      } finally {
        process.chdir(previousCwd);
      }
    } finally {
      project.cleanup();
    }
  });

  it("validates first-class 3.2 route annotations and checker-assisted inference", async () => {
    const project = createTempProject("nxog-openapi-32-routes-");

    try {
      const schemaDir = path.join(project.root, "src", "schemas");
      fs.mkdirSync(schemaDir, { recursive: true });
      fs.writeFileSync(
        path.join(schemaDir, "events.ts"),
        `import { z } from "zod";

export type SearchFilter = {
  status?: "active" | "archived";
};

export type EventChunk = {
  id: string;
  type: string;
};

export type SearchResponse = {
  total: number;
};

const SearchFilterExample = {
  status: "active",
} satisfies SearchFilter;

const EventChunkExample = {
  id: "evt_1",
  type: "update",
} satisfies EventChunk;

const SearchFilterSchema = z.object({
  status: z.enum(["active", "archived"]).optional(),
});

export const streamQueryExamples = [
  {
    name: "filters",
    value: SearchFilterSchema.parse(SearchFilterExample),
  },
];

export const streamResponseExamples = [
  {
    name: "structured",
    value: EventChunkExample,
  },
  {
    name: "wire",
    serializedValue: 'data: {"id":"evt_1","type":"update"}\\n\\n',
  },
];
`,
      );
      fs.writeFileSync(
        path.join(project.root, "tsconfig.json"),
        JSON.stringify(
          {
            compilerOptions: {
              baseUrl: ".",
              paths: {
                "@/*": ["src/*"],
              },
            },
            include: ["src"],
          },
          null,
          2,
        ),
      );
      fs.mkdirSync(path.join(project.root, "src", "app", "api", "events", "stream"), {
        recursive: true,
      });
      fs.writeFileSync(
        path.join(project.root, "src", "app", "api", "events", "stream", "route.ts"),
        `import {
  streamQueryExamples,
  streamResponseExamples,
  type EventChunk,
  type SearchFilter,
  type SearchResponse,
} from "@/schemas/events";

type NextResponse<T> = Response;
const NextResponse = {
  json<T>(body: T, init?: ResponseInit) {
    return Response.json(body, init) as NextResponse<T>;
  },
};

/**
 * Stream events
 * @tag Events
 * @tagSummary Event navigation
 * @tagKind nav
 * @querystring SearchFilter as advancedQuery
 * @responseContentType text/event-stream
 * @responseItem EventChunk
 * @examples querystring:streamQueryExamples
 * @examples response:streamResponseExamples
 * @openapi
 */
export async function GET() {
  return new Response(null, { status: 204 });
}

/**
 * Search events
 * @tag Events
 * @responseDescription Search result
 * @openapi
 */
export async function POST(): Promise<NextResponse<SearchResponse>> {
  return NextResponse.json({ total: 3 });
}
`,
      );

      const templatePath = writeOpenApiTemplate(project.root, {
        openapi: "3.2.0",
        schemaDir: "./src/schemas",
        schemaType: "typescript",
      });

      const previousCwd = process.cwd();
      process.chdir(project.root);

      try {
        const spec = new OpenApiGenerator({ templatePath }).generate();

        await expectValidSpec(spec);
        expect(spec.tags).toContainEqual(
          expect.objectContaining({
            name: "Events",
            summary: "Event navigation",
            kind: "nav",
          }),
        );
        expect(spec.paths?.["/events/stream"]?.get?.parameters).toContainEqual(
          expect.objectContaining({
            in: "querystring",
            name: "advancedQuery",
          }),
        );
        expect(
          spec.paths?.["/events/stream"]?.get?.responses?.["200"] &&
            "content" in spec.paths["/events/stream"].get.responses["200"]
            ? spec.paths["/events/stream"].get.responses["200"].content?.["text/event-stream"]
            : undefined,
        ).toMatchObject({
          itemSchema: {
            $ref: "#/components/schemas/EventChunk",
          },
          examples: {
            structured: {
              value: {
                id: "evt_1",
                type: "update",
              },
            },
            wire: {
              serializedValue: 'data: {"id":"evt_1","type":"update"}\n\n',
            },
          },
        });
        expect(
          spec.paths?.["/events/stream"]?.post?.responses?.["201"] &&
            "content" in spec.paths["/events/stream"].post.responses["201"]
            ? spec.paths["/events/stream"].post.responses["201"].content?.["application/json"]
            : undefined,
        ).toMatchObject({
          schema: {
            $ref: "#/components/schemas/SearchResponse",
          },
        });
      } finally {
        process.chdir(previousCwd);
      }
    } finally {
      project.cleanup();
    }
  });
});

async function expectValidSpec(spec: unknown) {
  const validator = new Validator();
  const result = await validator.validate(spec);

  expect(result).toMatchObject({ valid: true });
}
