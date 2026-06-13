import { describe, expect, it } from "vitest";
import traverseModule from "@babel/traverse";

import {
  capitalize,
  cleanComment,
  cleanSpec,
  deepMerge,
  extractInternalFlagFromComments,
  extractJSDocComments,
  extractTypeFromComment,
  extractPathParameters,
  getOperationId,
  parseResponseTag,
  parseTypeScriptFile,
  performAuthPresetReplacements,
} from "@workspace/openapi-core/shared/utils.js";

const traverse = traverseModule.default || traverseModule;

function getExportCommentData(source: string) {
  const ast = parseTypeScriptFile(source);
  let result: ReturnType<typeof extractJSDocComments> | undefined;

  traverse(ast, {
    ExportNamedDeclaration(path) {
      result = extractJSDocComments(path);
    },
  });

  return result;
}

describe("shared utils", () => {
  it("formats strings and route metadata helpers", () => {
    expect(capitalize("users")).toBe("Users");
    expect(extractPathParameters("/users/{id}/posts/{postId}")).toEqual(["id", "postId"]);
    expect(extractPathParameters("/users")).toEqual([]);
    expect(getOperationId("/users/{id}", "get")).toBe("get-users-{id}");
    expect(performAuthPresetReplacements("bearer,basic,apikey,Custom")).toBe(
      "BearerAuth,BasicAuth,ApiKeyAuth,Custom",
    );
    expect(cleanComment("* hello\n* world")).toBe("hello\nworld");
  });

  it("extracts full JSDoc metadata including status-only responses", () => {
    const data = getExportCommentData(`
      /**
       * Create a user
       * @openapi
       * @tag Users
       * @description Creates a user record
       * @queryParams UserQuery
       * @pathParams UserPath
       * @body CreateUserBody
       * @bodyDescription JSON payload
       * @auth basic
       * @contentType multipart/form-data
       * @response 204
       * @responseDescription Created without body
       * @responseSet common
       * @add 401:ErrorResponse
       * @add 429
       * @operationId createUser
       * @method post
       * @deprecated
       * @ignore
       */
      export async function POST() {}
    `);

    expect(data).toEqual({
      tag: "Users",
      tagSummary: "",
      tagKind: "",
      tagParent: "",
      auth: "basic",
      summary: "Create a user",
      description: "Creates a user record",
      paramsType: "UserQuery",
      pathParamsType: "UserPath",
      querystringType: "",
      querystringName: "",
      bodyType: "CreateUserBody",
      headerType: "",
      cookieType: "",
      isOpenApi: true,
      isIgnored: true,
      isWebhook: false,
      webhookName: "",
      deprecated: true,
      deprecationReason: "",
      bodyDescription: "JSON payload",
      contentType: "multipart/form-data",
      responseType: "",
      responseContentType: "",
      responseItemType: "",
      responseDescription: "Created without body",
      responseSet: "common",
      addResponses: "401:ErrorResponse,429",
      successCode: "204",
      operationId: "createUser",
      method: "POST",
    });
  });

  it("returns empty metadata when no JSDoc is attached", () => {
    const data = getExportCommentData("export const GET = async () => {};");

    expect(data).toEqual({
      tag: "",
      tagSummary: "",
      tagKind: "",
      tagParent: "",
      auth: "",
      summary: "",
      description: "",
      paramsType: "",
      pathParamsType: "",
      querystringType: "",
      querystringName: "",
      bodyType: "",
      headerType: "",
      cookieType: "",
      isOpenApi: false,
      isIgnored: false,
      isWebhook: false,
      webhookName: "",
      deprecated: false,
      deprecationReason: "",
      bodyDescription: "",
      contentType: "",
      responseType: "",
      responseContentType: "",
      responseItemType: "",
      responseDescription: "",
      responseSet: "",
      addResponses: "",
      successCode: "",
      operationId: "",
      method: "",
    });
  });

  it("handles minimal response tags and additional auth presets", () => {
    const data = getExportCommentData(`
      /**
       * @auth apikey
       * @response
       */
      export async function GET() {}
    `);

    expect(data?.auth).toBe("apikey");
    expect(data?.responseType).toBe("");
    expect(data?.successCode).toBe("");
  });

  it("parses inline @response variants documented in the README", () => {
    expect(parseResponseTag("@response UserResponse")).toEqual({
      responseDescription: "",
      responseType: "UserResponse",
      successCode: "",
    });
    expect(parseResponseTag("@response 201:UserResponse")).toEqual({
      responseDescription: "",
      responseType: "UserResponse",
      successCode: "201",
    });
    expect(parseResponseTag("@response UserResponse:Returns user profile data")).toEqual({
      responseDescription: "Returns user profile data",
      responseType: "UserResponse",
      successCode: "",
    });
    expect(parseResponseTag("@response 201:UserResponse:Returns newly created user")).toEqual({
      responseDescription: "Returns newly created user",
      responseType: "UserResponse",
      successCode: "201",
    });
    expect(parseResponseTag("@response 204:Empty:User successfully deleted")).toEqual({
      responseDescription: "User successfully deleted",
      responseType: "Empty",
      successCode: "204",
    });
  });

  it("handles bearer auth tags and ignores empty auth values", () => {
    const bearerData = getExportCommentData(`
      /**
       * @auth bearer
       */
      export async function GET() {}
    `);
    const emptyAuthData = getExportCommentData(`
      /**
       * @auth
       */
      export async function POST() {}
    `);

    expect(bearerData?.auth).toBe("bearer");
    expect(emptyAuthData?.auth).toBe("");
  });

  it("parses structured tag metadata, querystring, sequential media, and unified examples", () => {
    const data = getExportCommentData(`
      /**
       * Search events
       * @tag Events
       * @tagSummary Event navigation
       * @tagKind nav
       * @tagParent Platform
       * @querystring SearchFilter as advancedQuery
       * @responseContentType text/event-stream
       * @responseItem EventChunk
       * @responseItemEncoding {"headers":{"content-type":"application/json"}}
       * @responsePrefixEncoding [{"type":"text"},{"type":"binary"}]
       * @examples querystring:filters:{"status":"active"}
       * @examples response:[{"name":"structured","value":{"id":"evt_1"}},{"name":"wire","serializedValue":"data: {\\"id\\":\\"evt_1\\"}\\\\n\\\\n"}]
       */
      export async function GET() {}
    `);

    expect(data).toMatchObject({
      tag: "Events",
      tagSummary: "Event navigation",
      tagKind: "nav",
      tagParent: "Platform",
      querystringType: "SearchFilter",
      querystringName: "advancedQuery",
      responseContentType: "text/event-stream",
      responseItemType: "EventChunk",
      responseItemEncoding: {
        headers: {
          "content-type": "application/json",
        },
      },
      responsePrefixEncoding: [{ type: "text" }, { type: "binary" }],
      querystringExamples: {
        filters: {
          value: {
            status: "active",
          },
        },
      },
      responseExamples: {
        structured: {
          value: {
            id: "evt_1",
          },
        },
        wire: {
          serializedValue: 'data: {"id":"evt_1"}\\n\\n',
        },
      },
    });
  });

  it("supports body example aliases, 3.2 dataValue examples, and inline response types", () => {
    const data = getExportCommentData(`
      export const requestExamples = [
        {
          name: "default",
          value: {
            reason: "cleanup",
          },
        },
      ];

      /**
       * @response { success: boolean, message?: string }
       * @examples body:{"reason":"cleanup"}
       * @examples response:[{"name":"structured","dataValue":{"id":"evt_1"}}]
       * @openapi
       */
      export async function DELETE() {}
    `);

    expect(data).toMatchObject({
      responseType: "{ success: boolean, message?: string }",
      requestExamples: {
        example: {
          value: {
            reason: "cleanup",
          },
        },
      },
      responseExamples: {
        structured: {
          dataValue: {
            id: "evt_1",
          },
        },
      },
    });
  });

  it("extracts multiline type references and preserves empty summaries", () => {
    expect(
      extractTypeFromComment(
        `
        * @queryParams Result<
        *   User[]
        * >
        `,
        "@queryParams",
      ),
    ).toBe("Result<");

    const data = getExportCommentData(`
      /**
       * @description Only metadata
       */
      export async function GET() {}
    `);

    expect(data?.summary).toBe("");
    expect(data?.description).toBe("Only metadata");
  });

  it("adds path parameter examples without clobbering existing values", () => {
    const spec = cleanSpec({
      paths: {
        "/users/{id}/{slug}/{category}": {
          get: {
            parameters: [
              { name: "id", in: "path" },
              { name: "slug", in: "path" },
              { name: "category", in: "path" },
              { name: "preset", in: "path", example: "keep-me" },
              { name: "ignored", in: "query" },
            ],
          },
        },
      },
    });

    expect(spec.paths["/users/{id}/{slug}/{category}"].get.parameters).toEqual([
      { name: "id", in: "path", example: 123 },
      { name: "slug", in: "path", example: "example-slug" },
      { name: "category", in: "path", example: "example" },
      { name: "preset", in: "path", example: "keep-me" },
      { name: "ignored", in: "query" },
    ]);
  });

  it("skips missing path definitions and operations while cleaning specs", () => {
    const spec = cleanSpec({
      paths: {
        "/users/{id}": {
          get: undefined,
        },
        "/projects/{slug}": undefined,
      },
    });

    expect(spec.paths["/users/{id}"].get).toBeUndefined();
    expect(spec.paths["/projects/{slug}"]).toBeUndefined();
  });

  it("parses TSX with caller-provided parser options", () => {
    const ast = parseTypeScriptFile("const view = <div />;", {
      sourceFilename: "component.tsx",
    });

    expect(ast.program.body).toHaveLength(1);
    expect(ast.loc?.filename).toBe("component.tsx");
  });

  it("normalizes auth preset casing while keeping unknown entries", () => {
    expect(performAuthPresetReplacements("BEARER, apiKey, custom-scheme")).toBe(
      "BearerAuth,ApiKeyAuth,custom-scheme",
    );
  });

  it("applies custom presets when provided, with user keys winning over defaults", () => {
    const custom = { bearer: "JwtAuth", oauth2: "OAuth2Auth" };
    expect(performAuthPresetReplacements("bearer", custom)).toBe("JwtAuth");
    expect(performAuthPresetReplacements("bearer,oauth2", custom)).toBe("JwtAuth,OAuth2Auth");
    expect(performAuthPresetReplacements("bearer,CustomScheme", custom)).toBe(
      "JwtAuth,CustomScheme",
    );
  });

  it("parses OpenAPI 3.2 JSDoc annotations: @servers, @externalDocs, @security, @tags, @webhook", () => {
    const data = getExportCommentData(`
      /**
       * Subscribe to events
       * @tag Events
       * @tags Platform, Streaming
       * @servers https://api.example.com as production "Primary", https://staging.example.com
       * @externalDocs https://docs.example.com/events "Event docs"
       * @security BearerAuth, ApiKeyAuth:read:events|write:events
       * @webhook newEvent
       * @deprecated use /v2/subscribe instead
       * @openapi
       */
      export async function POST() {}
    `);

    expect(data?.tags).toEqual(["Platform", "Streaming"]);
    expect(data?.servers).toBeDefined();
    expect(data?.servers?.length).toBeGreaterThan(0);
    expect(data?.externalDocs).toMatchObject({
      url: "https://docs.example.com/events",
    });
    expect(data?.security).toBeDefined();
    expect(data?.security?.length).toBeGreaterThan(0);
    expect(data?.isWebhook).toBe(true);
    expect(data?.webhookName).toBe("newEvent");
    expect(data?.deprecated).toBe(true);
    expect(data?.deprecationReason).toBe("use /v2/subscribe instead");
  });

  it("handles multiple @tag annotations by using first as primary and rest as additional tags", () => {
    const data = getExportCommentData(`
      /**
       * @tag Events
       * @tag Platform
       * @tag Streaming
       * @openapi
       */
      export async function POST() {}
    `);
    expect(data?.tag).toBe("Events");
    expect(data?.tags).toEqual(["Platform", "Streaming"]);
  });

  it("handles multiple @response annotations by converting extras to @add entries", () => {
    const data = getExportCommentData(`
      /**
       * @response 200:UserResponse:Success
       * @response 404:NotFound
       * @response 429:RateLimitResponse:Too many requests
       * @openapi
       */
      export async function POST() {}
    `);
    expect(data?.successCode).toBe("200");
    expect(data?.responseType).toBe("UserResponse");
    expect(data?.responseDescription).toBe("Success");
    expect(data?.addResponses).toBe("404:NotFound,429:RateLimitResponse:Too many requests");
  });

  it("merges multiple @tag with @tags plural", () => {
    const data = getExportCommentData(`
      /**
       * @tag Events
       * @tag Platform
       * @tags Streaming, Webhooks
       * @openapi
       */
      export async function POST() {}
    `);
    expect(data?.tag).toBe("Events");
    expect(data?.tags).toEqual(["Streaming", "Webhooks", "Platform"]);
  });

  it("merges multiple @response with existing @add entries", () => {
    const data = getExportCommentData(`
      /**
       * @response 200:UserResponse
       * @response 404:NotFound
       * @add 401:Unauthorized
       * @openapi
       */
      export async function POST() {}
    `);
    expect(data?.successCode).toBe("200");
    expect(data?.responseType).toBe("UserResponse");
    expect(data?.addResponses).toBe("404:NotFound,401:Unauthorized");
  });

  it("parses @responseHeader, @link, @callback, and @openapi-override", () => {
    const data = getExportCommentData(`
      /**
       * Rate-limited endpoint
       * @responseHeader 200 X-RateLimit-Remaining integer Requests left
       * @responseHeader 429 Retry-After integer Seconds to wait
       * @link 201 GetUser #/components/links/GetUser
       * @callback onEvent {$request.body#callbackUrl} EventPayload
       * @openapi-override {"x-internal": true, "x-rateLimit": 100}
       * @openapi
       */
      export async function POST() {}
    `);

    expect(data?.responseHeaders).toEqual([
      {
        status: "200",
        name: "X-RateLimit-Remaining",
        description: "Requests left",
        schema: { type: "integer" },
      },
      {
        status: "429",
        name: "Retry-After",
        description: "Seconds to wait",
        schema: { type: "integer" },
      },
    ]);
    expect(data?.responseLinks).toEqual([
      {
        status: "201",
        name: "GetUser",
        operationRef: "#/components/links/GetUser",
      },
    ]);
    expect(data?.callbacks).toEqual([
      {
        name: "onEvent",
        expression: "{$request.body#callbackUrl}",
        reference: "EventPayload",
      },
    ]);
    expect(data?.openapiOverride).toEqual({
      "x-internal": true,
      "x-rateLimit": 100,
    });
  });

  it("parses @header and @cookie type references", () => {
    const data = getExportCommentData(`
      /**
       * @header RequestHeaders
       * @cookie SessionCookies
       * @openapi
       */
      export async function GET() {}
    `);

    expect(data?.headerType).toBe("RequestHeaders");
    expect(data?.cookieType).toBe("SessionCookies");
  });

  it("parses wildcard status codes in @response tags", () => {
    expect(parseResponseTag("@response 2XX:UserResponse")).toEqual({
      responseDescription: "",
      responseType: "UserResponse",
      successCode: "2XX",
    });
    expect(parseResponseTag("@response default:ErrorResponse:Fallback")).toEqual({
      responseDescription: "Fallback",
      responseType: "ErrorResponse",
      successCode: "default",
    });
    expect(parseResponseTag("@response 4XX:Unauthorized")).toEqual({
      responseDescription: "",
      responseType: "Unauthorized",
      successCode: "4XX",
    });
  });
});

describe("extractInternalFlagFromComments", () => {
  it("returns false for null comments", () => {
    expect(extractInternalFlagFromComments(null)).toBe(false);
  });

  it("returns false for empty comments", () => {
    expect(extractInternalFlagFromComments([])).toBe(false);
  });

  it("returns true for @internal tag", () => {
    expect(extractInternalFlagFromComments([{ type: "CommentBlock", value: "* @internal " }])).toBe(
      true,
    );
  });

  it("returns true for @schema false tag", () => {
    expect(
      extractInternalFlagFromComments([{ type: "CommentBlock", value: "* @schema false " }]),
    ).toBe(true);
  });

  it("returns false when neither @internal nor @schema false", () => {
    expect(
      extractInternalFlagFromComments([{ type: "CommentBlock", value: "* @id MySchema " }]),
    ).toBe(false);
  });

  it("returns true when @internal is among multiple tags", () => {
    expect(
      extractInternalFlagFromComments([
        { type: "CommentBlock", value: "* @id MySchema\n * @internal " },
      ]),
    ).toBe(true);
  });
});

describe("deepMerge", () => {
  it("merges top-level keys", () => {
    const target = { a: 1 };
    const source = { b: 2 };
    deepMerge(target, source);
    expect(target).toEqual({ a: 1, b: 2 });
  });

  it("source overwrites target for primitives", () => {
    const target = { a: 1 };
    const source = { a: 2 };
    deepMerge(target, source);
    expect(target).toEqual({ a: 2 });
  });

  it("recursively merges nested plain objects", () => {
    const target = { outer: { a: 1, b: 2 } };
    const source = { outer: { b: 3, c: 4 } };
    deepMerge(target, source);
    expect(target).toEqual({ outer: { a: 1, b: 3, c: 4 } });
  });

  it("preserves existing nested keys from target when source does not provide them", () => {
    const target = {
      requestBody: {
        content: { "application/json": { schema: { $ref: "#/components/schemas/Foo" } } },
      },
    };
    const source = { requestBody: { required: true } };
    deepMerge(target, source);
    expect(target).toEqual({
      requestBody: {
        content: { "application/json": { schema: { $ref: "#/components/schemas/Foo" } } },
        required: true,
      },
    });
  });

  it("replaces arrays instead of merging them", () => {
    const target = { tags: ["a", "b"] };
    const source = { tags: ["c"] };
    deepMerge(target, source);
    expect(target).toEqual({ tags: ["c"] });
  });

  it("replaces target value when source is an object and target is a primitive", () => {
    const target = { x: 5 };
    const source = { x: { nested: true } };
    deepMerge(target, source);
    expect(target).toEqual({ x: { nested: true } });
  });

  it("replaces target value when source is a primitive and target is an object", () => {
    const target = { x: { nested: true } };
    const source = { x: "replaced" };
    deepMerge(target, source);
    expect(target).toEqual({ x: "replaced" });
  });

  it("handles null source values as replacement", () => {
    const target = { a: { nested: true } };
    const source = { a: null };
    deepMerge(target, source);
    expect(target).toEqual({ a: null });
  });

  it("returns target unchanged for empty source", () => {
    const target = { a: 1 };
    deepMerge(target, {});
    expect(target).toEqual({ a: 1 });
  });
});
