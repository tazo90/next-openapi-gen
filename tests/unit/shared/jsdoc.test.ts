import os from "node:os";
import path from "node:path";

import traverseModule from "@babel/traverse";
import { describe, expect, it } from "vitest";

import {
  cleanComment,
  extractInternalFlagFromComments,
  extractSchemaIdFromComments,
  extractTypeFromComment,
  extractJSDocComments,
  parseJSDocBlock,
  parseOpenApiOverrideTag,
  parseResponseTag,
} from "@workspace/openapi-core/shared/jsdoc.js";
import { parseTypeScriptFile } from "@workspace/openapi-core/shared/parse-typescript.js";

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

describe("jsdoc", () => {
  it("cleans JSDoc comment stars", () => {
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
      tagDescription: "",
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
      requestItemType: "",
      responseDescription: "Created without body",
      responseSummary: "",
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
      tagDescription: "",
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
      requestItemType: "",
      responseDescription: "",
      responseSummary: "",
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

  it("parses OAS-aligned JSDoc aliases and high-value missing tags", () => {
    const data = getExportCommentData(`
      /**
       * Search users
       * @tag Users
       * @tagDescription User administration
       * @query UserQuery
       * @path UserPath
       * @header RequestHeaders
       * @cookie SessionCookies
       * @requestBody CreateUserBody required
       * @requestBodyDescription JSON payload
       * @requestContentType application/jsonl
       * @itemSchema request:UploadChunk
       * @itemSchema EventChunk
       * @itemEncoding request:{"headers":{"content-type":"application/json"}}
       * @itemEncoding {"headers":{"content-type":"text/plain"}}
       * @prefixEncoding [{"type":"text"}]
       * @response 201:UserResponse
       * @responseSummary 201 Created
       * @responseSummary User created
       * @examples query:limit:10
       * @examples header:{"X-Request-Id":"req_1"}
       * @examples cookie:session:"sess_1"
       * @openapi
       */
      export async function POST() {}
    `);

    expect(data).toMatchObject({
      tag: "Users",
      tagDescription: "User administration",
      paramsType: "UserQuery",
      pathParamsType: "UserPath",
      headerType: "RequestHeaders",
      cookieType: "SessionCookies",
      bodyType: "CreateUserBody",
      requestBodyRequired: true,
      bodyDescription: "JSON payload",
      contentType: "application/jsonl",
      requestItemType: "UploadChunk",
      responseItemType: "EventChunk",
      requestItemEncoding: {
        headers: {
          "content-type": "application/json",
        },
      },
      responseItemEncoding: {
        headers: {
          "content-type": "text/plain",
        },
      },
      responsePrefixEncoding: [{ type: "text" }],
      responseType: "UserResponse",
      successCode: "201",
      responseSummary: "User created",
      responseSummaries: {
        "201": "Created",
      },
      queryExamples: {
        limit: {
          value: 10,
        },
      },
      headerExamples: {
        example: {
          value: {
            "X-Request-Id": "req_1",
          },
        },
      },
      cookieExamples: {
        session: {
          value: "sess_1",
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

  it("parses webhooks, deprecation reasons, extra tags, and example references", () => {
    const withPath = parseJSDocBlock(
      `
      * Notify clients
      * @summary Explicit summary
      * @webhook payment.received
      * @deprecated Use v2 instead
      * @tags billing, notifications
      * @tag Payments
      * @tag Webhooks
      * @server https://api.example.com Production
      * @servers https://staging.example.com
      * @externalDocs https://docs.example.com "API docs"
      * @security bearer:read,write; apiKey
      * @responseHeader 200 X-Request-Id string Correlation id
      * @responseHeader 200 RateLimit integer
      * @responseHeader 200 X-Trace RateLimitHeader
      * @link 201 next getUser {"userId":"$response.body#/id"}
      * @link 200 self #/paths/~1users/get
      * @callback onEvent {$request.body#/callbackUrl} CallbackOp
      * @openapi-override {"x-internal":true}
      * @examples response:https://example.com/examples/payment.json
      * @examples query:serialized:limit=10
      * @examples header:ref:missingExample
      * @examples cookie:filters
      * @openapi
      `,
      path.join(os.tmpdir(), "nxog-jsdoc-missing", "route.ts"),
    );

    expect(withPath).toMatchObject({
      summary: "Explicit summary",
      isWebhook: true,
      webhookName: "payment.received",
      deprecated: true,
      deprecationReason: "Use v2 instead",
      tag: "Payments",
      tags: ["billing", "notifications", "Webhooks"],
      servers: [
        { url: "https://api.example.com", description: "Production" },
        { url: "https://staging.example.com" },
      ],
      externalDocs: { url: "https://docs.example.com", description: "API docs" },
      security: [{ bearer: ["read", "write"], apiKey: [] }],
      responseHeaders: [
        {
          status: "200",
          name: "X-Request-Id",
          schema: { type: "string" },
          description: "Correlation id",
        },
        { status: "200", name: "RateLimit", schema: { type: "integer" } },
        {
          status: "200",
          name: "X-Trace",
          schema: { $ref: "#/components/schemas/RateLimitHeader" },
        },
      ],
      responseLinks: [
        {
          status: "201",
          name: "next",
          operationId: "getUser",
          parameters: { userId: "$response.body#/id" },
        },
        { status: "200", name: "self", operationRef: "#/paths/~1users/get" },
      ],
      callbacks: [
        { name: "onEvent", expression: "{$request.body#/callbackUrl}", reference: "CallbackOp" },
      ],
      openapiOverride: { "x-internal": true },
      responseExamples: {
        example: {
          externalValue: "https://example.com/examples/payment.json",
        },
      },
      queryExamples: {
        example: {
          serializedValue: "limit=10",
        },
      },
    });
    expect(
      withPath.diagnostics?.some(
        (diagnostic) => diagnostic.code === "example-reference-unresolved",
      ),
    ).toBe(true);

    const withoutPath = parseJSDocBlock(`
      * @examples body:requestExample
      * @openapi
    `);
    expect(withoutPath.diagnostics?.[0]).toMatchObject({
      code: "example-reference-unresolved",
    });

    expect(parseOpenApiOverrideTag('* @openapi-override {"x-flag":1}')).toEqual({ "x-flag": 1 });
    expect(parseOpenApiOverrideTag("* @openapi-override true")).toBeUndefined();
    expect(extractSchemaIdFromComments(null)).toBeNull();
    expect(
      extractSchemaIdFromComments([{ type: "CommentBlock", value: "* @id PaymentEvent " }]),
    ).toBe("PaymentEvent");
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

  it("covers leftover summary, add-response, and encoding branches", () => {
    const data = parseJSDocBlock(`
      @openapi
      @add 409 Conflict
      @add 410 Gone
      @responsePrefixEncoding [{"style":"form"}]
      @prefixEncoding [{"style":"form"}]
      @itemEncoding {"style":"form"}
      @responseItemEncoding {"style":"deepObject"}
    `);
    expect(data.addResponses).toContain("409");
    expect(data.addResponses).toContain("410");
    expect(data.responsePrefixEncoding).toEqual([{ style: "form" }]);

    const requestEncoding = parseJSDocBlock(`
      @openapi
      @prefixEncoding request: [{"style":"form","explode":true}]
      @itemEncoding request: {"style":"form"}
      @body CreateUser required
      @requestBody PatchUser required=false
      @responseSummary 201 Created
      @responseSummary Default summary
      @server
      @servers https://api.example.com
      @externalDocs
    `);
    expect(requestEncoding.requestPrefixEncoding).toEqual([{ style: "form", explode: true }]);
    expect(requestEncoding.bodyType).toBe("PatchUser");
    expect(requestEncoding.requestBodyRequired).toBe(true);
    expect(requestEncoding.responseSummaries).toMatchObject({
      "201": "Created",
    });

    const emptySummary = parseJSDocBlock(`
      @openapi
      @summary Explicit
    `);
    expect(emptySummary.summary).toBe("Explicit");

    const requiredFlags = parseJSDocBlock(`
      @openapi
      @body required
      @requestBody User optional
      @itemSchema request: Item
      @responseHeader
      @responseHeader 200
      @security
      @responseSummary
      @server
      @externalDocs
    `);
    expect(requiredFlags.requestBodyRequired).toBe(true);
    expect(requiredFlags.bodyType).toBe("User");
    expect(requiredFlags.requestItemType).toBe("Item");

    expect(parseJSDocBlock("@openapi\n@webhook").isWebhook).toBe(true);
    expect(parseJSDocBlock("@openapi\n@webhook").webhookName).toBeFalsy();
    const leftoverFlags = parseJSDocBlock(`
      @openapi
      @add
      @add 401
      @tag Users
      @tag Admin
      @body User optional
      @requestBody required=false
      @itemSchema
      @itemSchema request: Item
    `);
    expect(leftoverFlags.addResponses).toEqual(expect.stringContaining("401"));
    expect(leftoverFlags.tag).toBe("Users");
    expect(leftoverFlags.tags).toEqual(expect.arrayContaining(["Admin"]));
    expect(leftoverFlags.bodyType).toBe("User");
    expect(parseJSDocBlock("@openapi\n@body required=true").requestBodyRequired).toBe(true);
    expect(parseJSDocBlock("@openapi\n@body CreateUser required=true").bodyType).toBe("CreateUser");

    const leftoverTags = parseJSDocBlock(`
      @openapi
      @link
      @link 201
      @link 201 next
      @link 200 self /paths/users
      @link 201 next getUser {not-json
      @responseHeader 200 X-Id weird-type
      @callback
      @callback onEvent
    `);
    const merged = getExportCommentData(`
      /**
       * @openapi
       * @examples header:ref:missingA
       * @deprecated
       * @description First
       */
      /**
       * @openapi
       * @examples header:ref:missingB
       * @deprecated
       * @description
       */
      export async function POST() {}
    `);
    expect(merged?.deprecated).toBe(true);
    expect(merged?.description).toBe("First");

    expect(leftoverTags.responseLinks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: "200", name: "self", operationRef: "/paths/users" }),
      ]),
    );

    const leftoverMerge = parseJSDocBlock(`List users
      @openapi
      @response 200 User
      @response
      @add 409
      @tags public
      @tag Users
      @tag Admin
      @servers https://api.example.com Production
      @servers https://staging.example.com "Staging"
      @externalDocs https://docs.example.com "API docs"
      @security Bearer:read,write
      @security :empty
      @security Admin
      @responseHeader 200 X-Count integer Total items
    `);
    expect(leftoverMerge.summary).toBe("List users");
    expect(leftoverMerge.addResponses).toEqual(expect.stringContaining("409"));
    expect(leftoverMerge.tag).toBe("Users");
    expect(leftoverMerge.tags).toEqual(expect.arrayContaining(["public", "Admin"]));
    expect(leftoverMerge.servers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ url: "https://api.example.com", description: "Production" }),
        expect.objectContaining({ url: "https://staging.example.com", description: "Staging" }),
      ]),
    );
    expect(leftoverMerge.externalDocs).toEqual({
      url: "https://docs.example.com",
      description: "API docs",
    });
    expect(leftoverMerge.security).toEqual(
      expect.arrayContaining([{ Bearer: ["read", "write"] }, { Admin: [] }]),
    );
    expect(leftoverMerge.responseHeaders).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: "200", name: "X-Count", description: "Total items" }),
      ]),
    );
    expect(parseJSDocBlock("\n\n@openapi\n@body required=false").requestBodyRequired).toBeFalsy();

    const emptyCaptures = parseJSDocBlock(
      [
        "@openapi",
        "@response \t",
        "@add \t",
        "@tag \t",
        "@body \t",
        "@itemSchema \t",
        "@itemSchema response: \t",
        "@responseSummary \t",
        "@servers \t",
        "@externalDocs \t",
        "@security \t",
        "@link \t",
        "@callback \t",
        "@responseHeader \t",
      ].join("\n"),
    );
    expect(emptyCaptures.responseType).toBeFalsy();
    expect(emptyCaptures.addResponses).toBeFalsy();
    expect(emptyCaptures.tag).toBeFalsy();

    const mergedAdds = parseJSDocBlock(`
      @openapi
      @response 200 User
      @response 201 Created
      @add 409
    `);
    expect(mergedAdds.addResponses).toEqual(expect.stringContaining("201"));
    expect(mergedAdds.addResponses).toEqual(expect.stringContaining("409"));

    expect(parseJSDocBlock("@openapi\n@response 2XX").successCode).toBe("2XX");
    expect(parseJSDocBlock("@openapi\n@body").bodyType).toBeFalsy();
    expect(parseJSDocBlock("@openapi\n@querystring SearchFilter").querystringName).toBe(
      "searchfilter",
    );
    expect(
      parseJSDocBlock(`
      @openapi
      @examples request
      @examples request:named:ref:UserExample
      @examples body:{"ok":true}
      @examples response:named:{"ok":true}
    `).requestExamples,
    ).toBeDefined();
    expect(parseOpenApiOverrideTag("* @openapi-override []")).toBeUndefined();
    expect(
      parseJSDocBlock(`
      @openapi
      @examples request:nameless
      @examples not-a-target:value
      @examples header:ref:
      @examples cookie:name
    `).headerExamples,
    ).toBeUndefined();

    expect(parseJSDocBlock("@openapi\n@bodyType \t").bodyType).toBeFalsy();
    expect(parseJSDocBlock("@openapi\n@example \t").requestExamples).toBeUndefined();
    expect(parseJSDocBlock("@openapi\n@responseSummary \t").responseSummaries).toBeUndefined();
    expect(parseJSDocBlock("@openapi\n@response 200:{id:string}").responseType).toBe("{id:string}");
    expect(
      parseJSDocBlock(`
      @openapi
      @examples request:named:{"ok":true}
      @examples request:named:{"also":true}
    `).requestExamples,
    ).toBeDefined();
    expect(
      parseJSDocBlock(`
      @openapi
      @examples response:named:{"summary":"ok","description":"done","dataValue":1,"serializedValue":"1","externalValue":"https://ex"}
    `).responseExamples,
    ).toBeDefined();
    expect(
      parseJSDocBlock(`
      @openapi
      @examples request:[{"ok":true},{"ok":false}]
    `).requestExamples,
    ).toBeDefined();
    expect(parseResponseTag("")).toBeNull();
    expect(parseResponseTag("@response 200")).toEqual(
      expect.objectContaining({ successCode: "200" }),
    );
  });
});

describe("extractInternalFlagFromComments leftover", () => {
  it("returns true when @internal is among multiple tags", () => {
    expect(
      extractInternalFlagFromComments([
        { type: "CommentBlock", value: "* @id MySchema\n * @internal " },
      ]),
    ).toBe(true);
  });
});
