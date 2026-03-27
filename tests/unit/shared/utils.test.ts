import { describe, expect, it } from "vitest";
import traverseModule from "@babel/traverse";

import {
  capitalize,
  cleanComment,
  cleanSpec,
  extractJSDocComments,
  extractTypeFromComment,
  extractPathParameters,
  getOperationId,
  parseTypeScriptFile,
  performAuthPresetReplacements,
} from "@next-openapi-gen/shared/utils.js";

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
      auth: "BasicAuth",
      summary: "Create a user",
      description: "Creates a user record",
      paramsType: "UserQuery",
      pathParamsType: "UserPath",
      bodyType: "CreateUserBody",
      isOpenApi: true,
      isIgnored: true,
      deprecated: true,
      bodyDescription: "JSON payload",
      contentType: "multipart/form-data",
      responseType: "",
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
      auth: "",
      summary: "",
      description: "",
      paramsType: "",
      pathParamsType: "",
      bodyType: "",
      isOpenApi: false,
      isIgnored: false,
      deprecated: false,
      bodyDescription: "",
      contentType: "",
      responseType: "",
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

    expect(data?.auth).toBe("ApiKeyAuth");
    expect(data?.responseType).toBe("");
    expect(data?.successCode).toBe("");
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

    expect(bearerData?.auth).toBe("BearerAuth");
    expect(emptyAuthData?.auth).toBe("");
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
});
