import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { parseTypeScriptFile } from "@workspace/openapi-core/shared/utils.js";
import * as t from "@babel/types";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SchemaProcessor } from "@workspace/openapi-core/schema/typescript/schema-processor.js";

describe("SchemaProcessor", () => {
  const roots: string[] = [];

  afterEach(() => {
    vi.restoreAllMocks();
    roots.splice(0).forEach((root) => fs.rmSync(root, { recursive: true, force: true }));
  });

  it("covers request and response helper methods", () => {
    const processor = new SchemaProcessor(process.cwd(), "typescript");

    expect(processor.getExampleForParam("userId")).toBe("123");
    expect(processor.getExampleForParam("page", "number")).toBe(1);
    expect(processor.getExampleForParam("isEnabled", "boolean")).toBe(true);
    expect(processor.detectContentType("AvatarUpload")).toBe("application/json");
    expect(processor.detectContentType("MultipartFormDataPayload")).toBe("multipart/form-data");
    expect(processor.detectContentType("Ignored", "text/plain")).toBe("text/plain");

    expect(
      processor.createMultipleResponsesSchema(
        {
          401: "Unauthorized",
          422: {
            description: "Validation failed",
            schema: { type: "object" },
          },
        },
        "Fallback",
      ),
    ).toEqual({
      401: { $ref: "#/components/responses/Unauthorized" },
      422: {
        description: "Validation failed",
        content: {
          "application/json": {
            schema: { type: "object" },
          },
        },
      },
    });

    expect(processor.createDefaultPathParamsSchema(["id", "slug"])).toEqual([
      {
        name: "id",
        in: "path",
        required: true,
        schema: { type: "number" },
        example: 123,
        description: "Path parameter: id",
      },
      {
        name: "slug",
        in: "path",
        required: true,
        schema: { type: "string" },
        example: "slug",
        description: "Path parameter: slug",
      },
    ]);

    expect(
      processor.createRequestParamsSchema(
        {
          properties: {
            status: {
              type: "string",
              enum: ["draft", "published"],
              description: "Filter status",
              required: true,
            },
          },
        },
        true,
      ),
    ).toEqual([
      {
        in: "path",
        name: "status",
        schema: {
          type: "string",
          enum: ["draft", "published"],
          description: "Filter status",
        },
        required: true,
        description: "Filter status",
        example: "example",
      },
    ]);

    expect(
      processor.createRequestBodySchema(
        {
          type: "object",
          properties: {
            avatarFile: {
              type: "object",
              description: "Profile file",
            },
            caption: {
              type: "string",
            },
          },
        },
        "Upload body",
        "multipart/form-data",
        {
          upload: {
            value: {
              caption: "avatar",
            },
          },
        },
      ),
    ).toMatchObject({
      description: "Upload body",
      content: {
        "multipart/form-data": {
          schema: {
            type: "object",
            properties: {
              avatarFile: {
                type: "string",
                format: "binary",
                description: "Profile file",
              },
              caption: {
                type: "string",
              },
            },
          },
          examples: {
            upload: {
              value: {
                caption: "avatar",
              },
            },
          },
        },
      },
    });

    expect(processor.createResponseSchema({ type: "object" }, "Created")).toEqual({
      200: {
        description: "Created",
        content: {
          "application/json": {
            schema: { type: "object" },
          },
        },
      },
    });
  });

  it("resolves schema content lookups and strips array notation", () => {
    const processor = new SchemaProcessor(process.cwd(), "typescript");
    const lookupSpy = vi
      .spyOn(processor, "findSchemaDefinition")
      .mockImplementation((schemaName: string) => {
        const resolved = {
          type: "object",
          title: schemaName,
        };
        (processor as any).openapiDefinitions[schemaName] = resolved;
        return resolved;
      });

    const content = processor.getSchemaContent({
      tag: { type: "string" },
      paramsType: "QueryParams",
      pathParamsType: "UserPathParams",
      bodyType: "CreateUserBody[][]",
      responseType: "CreateUserResponse[]",
    });

    expect(content).toEqual({
      tag: { type: "string" },
      params: { type: "object", title: "QueryParams" },
      querystring: {},
      pathParams: { type: "object", title: "UserPathParams" },
      body: { type: "object", title: "CreateUserBody" },
      responses: { type: "object", title: "CreateUserResponse" },
    });
    expect(lookupSpy).toHaveBeenCalledWith("CreateUserBody", "body");
    expect(lookupSpy).toHaveBeenCalledWith("CreateUserResponse", "response");
  });

  it("rechecks unresolved schemas when zod support is enabled", () => {
    const processor = new SchemaProcessor(process.cwd(), ["typescript", "zod"]);
    const lookupSpy = vi
      .spyOn(processor, "findSchemaDefinition")
      .mockImplementation((schemaName, contentType) => {
        if (contentType) {
          return {};
        }

        const resolved = {
          type: "object",
          title: schemaName,
        };
        (processor as any).openapiDefinitions[schemaName] = resolved;
        return resolved;
      });

    const content = processor.getSchemaContent({
      paramsType: "FilterParams",
      bodyType: "CreateUserInput",
    });

    expect(content.params).toEqual({});
    expect(content.body).toEqual({});
    expect((processor as any).openapiDefinitions.FilterParams).toEqual({
      type: "object",
      title: "FilterParams",
    });
    expect((processor as any).openapiDefinitions.CreateUserInput).toEqual({
      type: "object",
      title: "CreateUserInput",
    });
    expect(lookupSpy).toHaveBeenCalledWith("FilterParams", "params");
    expect(lookupSpy).toHaveBeenCalledWith("FilterParams", "");
    expect(lookupSpy).toHaveBeenCalledWith("CreateUserInput", "body");
    expect(lookupSpy).toHaveBeenCalledWith("CreateUserInput", "");
  });

  it("resolves generic type aliases from schema files", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-schema-processor-generics-"));
    roots.push(root);

    fs.writeFileSync(
      path.join(root, "schemas.ts"),
      [
        "export interface User {",
        "  id: string;",
        "}",
        "",
        "export type ApiResponse<T> = T & {",
        "  success: boolean;",
        "};",
      ].join("\n"),
    );

    const processor = new SchemaProcessor(root, "typescript");
    const schema = processor.findSchemaDefinition("ApiResponse<User>", "response");

    expect(schema).toEqual({
      type: "object",
      properties: {
        id: {
          type: "string",
        },
        success: {
          type: "boolean",
        },
      },
      required: ["id", "success"],
    });
  });

  it("preserves primitive aliases, required properties, and generic array substitution", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-schema-processor-fidelity-"));
    roots.push(root);

    fs.writeFileSync(
      path.join(root, "schemas.ts"),
      [
        "export type PlainString = string;",
        "",
        "export interface FilterShape {",
        "  id: string;",
        "  label?: string;",
        "}",
        "",
        "export interface WebhookAttempt {",
        "  id: string;",
        '  status: "delivered" | "failed";',
        "}",
        "",
        "export interface PaginatedResponse<T> {",
        "  data: T[];",
        "  total: number;",
        "}",
      ].join("\n"),
    );

    const processor = new SchemaProcessor(root, "typescript");

    expect(processor.findSchemaDefinition("PlainString", "response")).toEqual({
      type: "string",
    });
    expect(processor.findSchemaDefinition("FilterShape", "response")).toEqual({
      type: "object",
      properties: {
        id: {
          type: "string",
        },
        label: {
          type: "string",
        },
      },
      required: ["id"],
    });
    expect(processor.findSchemaDefinition("PaginatedResponse<WebhookAttempt>", "response")).toEqual(
      {
        type: "object",
        properties: {
          data: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: {
                  type: "string",
                },
                status: {
                  type: "string",
                  enum: ["delivered", "failed"],
                },
              },
              required: ["id", "status"],
            },
          },
          total: {
            type: "number",
          },
        },
        required: ["data", "total"],
      },
    );
  });

  it("filters invalid, generic, utility, and function schemas from defined schemas", () => {
    const processor = new SchemaProcessor(process.cwd(), "typescript");

    (processor as any).openapiDefinitions = {
      User: { type: "object" },
      T: { type: "string" },
      "Bad Name": { type: "string" },
      Record: { type: "object" },
      Handler: { type: "object" },
    };
    (processor as any).typeDefinitions = {
      Handler: {
        node: t.arrowFunctionExpression([], t.blockStatement([])),
      },
    };

    expect(processor.getDefinedSchemas()).toEqual({
      User: { type: "object" },
    });
  });

  it("collects imports and exported definitions from parsed files", () => {
    const processor = new SchemaProcessor(process.cwd(), "typescript");
    const filePath = path.join(process.cwd(), "fixtures.ts");
    const ast = parseTypeScriptFile(`
      import DefaultThing from "./default";
      import { NamedThing } from "./named";
      import * as NamespaceThing from "./namespace";

      export type GenericBox<T> = { value: T };
      export type PlainAlias = string;
      export interface UserContract {
        id: string;
      }
      export enum Status {
        Active = "active",
      }
    `);

    (processor as any).collectImports(ast, filePath);
    (processor as any).collectAllExportedDefinitions(ast, filePath);

    expect((processor as any).importMap[path.normalize(filePath)]).toEqual({
      DefaultThing: "./default",
      NamedThing: "./named",
      NamespaceThing: "./namespace",
    });
    expect((processor as any).typeDefinitions.GenericBox.filePath).toBe(filePath);
    expect(t.isTSTypeAliasDeclaration((processor as any).typeDefinitions.GenericBox.node)).toBe(
      true,
    );
    expect(t.isTSStringKeyword((processor as any).typeDefinitions.PlainAlias.node)).toBe(true);
    expect(t.isTSInterfaceDeclaration((processor as any).typeDefinitions.UserContract.node)).toBe(
      true,
    );
    expect(t.isTSEnumDeclaration((processor as any).typeDefinitions.Status.node)).toBe(true);
  });

  it("resolves relative import paths against the caller file", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-schema-processor-imports-"));
    roots.push(root);

    const fromDir = path.join(root, "src");
    fs.mkdirSync(fromDir, { recursive: true });
    fs.writeFileSync(path.join(root, "target.ts"), "");
    fs.writeFileSync(path.join(root, "component.tsx"), "");
    fs.writeFileSync(path.join(root, "already.ts"), "");

    const processor = new SchemaProcessor(root, "typescript");
    const fromFile = path.join(fromDir, "index.ts");

    expect((processor as any).resolveImportPath("../target", fromFile)).toBe(
      path.join(root, "target.ts"),
    );
    expect((processor as any).resolveImportPath("../component", fromFile)).toBe(
      path.join(root, "component.tsx"),
    );
    expect((processor as any).resolveImportPath("../already.ts", fromFile)).toBe(
      path.join(root, "already.ts"),
    );
    expect((processor as any).resolveImportPath("zod", fromFile)).toBeNull();
    expect((processor as any).resolveImportPath("../missing", fromFile)).toBeNull();
  });

  it("extracts return types and parameters from supported function node shapes", () => {
    const processor = new SchemaProcessor(process.cwd(), "typescript");
    const ast = parseTypeScriptFile(`
      export function declared(value: string): number {
        return value.length;
      }

      const assigned = (count: number): boolean => count > 0;
      const anonymous = function (input: string): string {
        return input;
      };
    `);
    const [declaredFn, assignedDecl, anonymousDecl] = ast.program.body;

    if (!declaredFn || !t.isExportNamedDeclaration(declaredFn) || !declaredFn.declaration) {
      throw new Error("Expected exported declaration");
    }

    const declaredNode = declaredFn.declaration;
    if (!t.isFunctionDeclaration(declaredNode)) {
      throw new Error("Expected function declaration");
    }

    if (!assignedDecl || !t.isVariableDeclaration(assignedDecl)) {
      throw new Error("Expected variable declaration");
    }

    const assignedNode = assignedDecl.declarations[0];

    if (!anonymousDecl || !t.isVariableDeclaration(anonymousDecl)) {
      throw new Error("Expected variable declaration");
    }

    const anonymousNode = anonymousDecl.declarations[0]?.init;

    expect(t.isTSNumberKeyword((processor as any).extractFunctionReturnType(declaredNode))).toBe(
      true,
    );
    expect(t.isTSBooleanKeyword((processor as any).extractFunctionReturnType(assignedNode))).toBe(
      true,
    );
    expect(t.isTSStringKeyword((processor as any).extractFunctionReturnType(anonymousNode))).toBe(
      true,
    );
    expect((processor as any).extractFunctionReturnType(t.identifier("noop"))).toBeNull();

    expect((processor as any).extractFunctionParameters(declaredNode)).toHaveLength(1);
    expect((processor as any).extractFunctionParameters(assignedNode)).toHaveLength(1);
    expect((processor as any).extractFunctionParameters(anonymousNode)).toHaveLength(1);
    expect((processor as any).extractFunctionParameters(t.identifier("noop"))).toEqual([]);
  });
});
