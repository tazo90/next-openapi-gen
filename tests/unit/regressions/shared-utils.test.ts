import { describe, expect, it } from "vitest";
import traverseModule from "@babel/traverse";

import { extractJSDocComments, parseTypeScriptFile } from "@workspace/openapi-core/shared/utils.js";

const traverse = traverseModule.default || traverseModule;

describe("shared JSDoc utilities regressions", () => {
  it("detects @ignore in function and variable exports", () => {
    const functionAst = parseTypeScriptFile(`
      /**
       * Internal route
       * @ignore
       */
      export async function GET() {}
    `);
    const variableAst = parseTypeScriptFile(`
      /** @ignore */
      export const POST = async () => {};
    `);

    let functionData: ReturnType<typeof extractJSDocComments> | undefined;
    let variableData: ReturnType<typeof extractJSDocComments> | undefined;

    traverse(functionAst, {
      ExportNamedDeclaration: (path) => {
        functionData = extractJSDocComments(path);
      },
    });
    traverse(variableAst, {
      ExportNamedDeclaration: (path) => {
        variableData = extractJSDocComments(path);
      },
    });

    expect(functionData?.isIgnored).toBe(true);
    expect(variableData?.isIgnored).toBe(true);
  });

  it("extracts operationId and mixed auth presets", () => {
    const ast = parseTypeScriptFile(`
      /**
       * @operationId createNewUser
       * @auth bearer,CustomType
       * @response 201:UserResponse
       */
      export async function POST() {}
    `);

    let dataTypes: ReturnType<typeof extractJSDocComments> | undefined;
    traverse(ast, {
      ExportNamedDeclaration: (path) => {
        dataTypes = extractJSDocComments(path);
      },
    });

    expect(dataTypes?.operationId).toBe("createNewUser");
    expect(dataTypes?.auth).toBe("BearerAuth,CustomType");
    expect(dataTypes?.successCode).toBe("201");
    expect(dataTypes?.responseType).toBe("UserResponse");
  });

  it("captures multiple @add tags", () => {
    const ast = parseTypeScriptFile(`
      /**
       * @response 200:UserResponse
       * @add 401:ErrorResponse
       * @add 500:ErrorResponse
       */
      export async function GET() {}
    `);

    let dataTypes: ReturnType<typeof extractJSDocComments> | undefined;
    traverse(ast, {
      ExportNamedDeclaration: (path) => {
        dataTypes = extractJSDocComments(path);
      },
    });

    expect(dataTypes?.addResponses).toBe("401:ErrorResponse,500:ErrorResponse");
  });
});
