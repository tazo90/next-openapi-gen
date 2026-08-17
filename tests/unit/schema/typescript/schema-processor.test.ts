import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import * as t from "@babel/types";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DiagnosticsCollector } from "@workspace/openapi-core/diagnostics/collector.js";
import {
  extractFunctionParameters,
  extractFunctionReturnType,
} from "@workspace/openapi-core/schema/typescript/function-nodes.js";
import { SchemaProcessor } from "@workspace/openapi-core/schema/typescript/schema-processor.js";
import { parseTypeScriptFile } from "@workspace/openapi-core/shared/parse-typescript.js";

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
    expect(processor.getExampleForParam("organizationId", { type: "string", format: "uuid" })).toBe(
      "123e4567-e89b-12d3-a456-426614174000",
    );
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
        schema: { type: "string" },
        example: "123",
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
        // First enum member: an example outside the enum is invalid against the schema.
        example: "draft",
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
                contentMediaType: "application/octet-stream",
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
      .mockImplementation((schemaName, _contentType) => {
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

    expect(content.params).toEqual({
      type: "object",
      title: "FilterParams",
    });
    expect(content.body).toEqual({
      type: "object",
      title: "CreateUserInput",
    });
    expect((processor as any).openapiDefinitions.FilterParams).toEqual({
      type: "object",
      title: "FilterParams",
    });
    expect((processor as any).openapiDefinitions.CreateUserInput).toEqual({
      type: "object",
      title: "CreateUserInput",
    });
    expect(lookupSpy).toHaveBeenCalledWith("FilterParams", "params");
    expect(lookupSpy).toHaveBeenCalledWith("CreateUserInput", "body");
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

    expect(t.isTSNumberKeyword(extractFunctionReturnType(declaredNode))).toBe(true);
    expect(t.isTSBooleanKeyword(extractFunctionReturnType(assignedNode))).toBe(true);
    expect(t.isTSStringKeyword(extractFunctionReturnType(anonymousNode))).toBe(true);
    expect(extractFunctionReturnType(t.identifier("noop"))).toBeNull();

    expect(extractFunctionParameters(declaredNode)).toHaveLength(1);
    expect(extractFunctionParameters(assignedNode)).toHaveLength(1);
    expect(extractFunctionParameters(anonymousNode)).toHaveLength(1);
    expect(extractFunctionParameters(t.identifier("noop"))).toEqual([]);
  });

  it("resolves types from outside schemaDir via TypeScript checker fallback", () => {
    // Regression: types defined in node_modules or a shared workspace package that is not
    // covered by schemaDir were silently resolved to `{}`. The fix uses the importMap to
    // find a scanned file that imports the type, then delegates to resolveTypeWithTypeScriptChecker.
    const fixtureDir = path.resolve(__dirname, "../../../fixtures/external-type-resolution");
    // schemaDir is only "src/" — shared-types.ts lives at the fixture root (outside src/)
    const schemaDir = path.join(fixtureDir, "src");
    const processor = new SchemaProcessor(schemaDir, "typescript");

    const userSchema = processor.findSchemaDefinition("ExternalUser", "response");
    expect(userSchema).toMatchObject({
      type: "object",
      properties: expect.objectContaining({
        id: expect.objectContaining({ type: expect.stringMatching(/number|integer/) }),
        name: { type: "string" },
        email: { type: "string" },
      }),
    });

    const errorSchema = processor.findSchemaDefinition("ExternalApiError", "response");
    expect(errorSchema).toMatchObject({
      type: "object",
      properties: expect.objectContaining({
        message: { type: "string" },
        statusCode: expect.objectContaining({ type: expect.stringMatching(/number|integer/) }),
      }),
    });
  });

  it("resolves inline type expressions and schema reference helpers", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-schema-processor-inline-"));
    roots.push(root);
    fs.writeFileSync(
      path.join(root, "user.ts"),
      "export type User = { id: string; name?: string };\n",
    );

    const processor = new SchemaProcessor(root, "typescript");
    expect(processor.resolveTypeExpression("")).toEqual({ type: "object" });
    expect(processor.resolveTypeExpression("{ ok: boolean }")).toMatchObject({
      type: "object",
      properties: { ok: { type: "boolean" } },
    });
    expect(processor.resolveTypeExpression("{ ok: boolean }")).toMatchObject({
      type: "object",
    });
    expect(processor.resolveTypeExpression("@@@")).toEqual({ type: "object" });

    processor.ensureSchemaResolved("User[]");
    processor.ensureSchemaResolved("User[]");
    processor.ensureSchemaResolved("{ inline: true }");
    processor.ensureSchemaResolved("");
    expect(processor.hasResolvedSchema("User[]")).toBe(true);
    expect(processor.hasSchemaCandidate("User")).toBe(true);
    expect(processor.getSchemaReferenceName("User[]")).toBe("User");
    expect(processor.getSchemaReferenceName("string")).toBe("string");
    expect(processor.getSchemaReferenceName("{ id: string }")).toBe("{ id: string }");
    expect(processor.getDefinedSchemas().User).toBeDefined();
    expect(processor.getInternalSchemas()).toEqual({});
    (processor as unknown as { internalSchemaNames: Set<string> }).internalSchemaNames.add("User");
    (
      processor as unknown as { openapiDefinitions: Record<string, unknown> }
    ).openapiDefinitions.User = { type: "object" };
    expect(processor.getInternalSchemas()).toMatchObject({ User: { type: "object" } });
    expect(processor.findSchemaDefinition("User", "response")).toMatchObject({ type: "object" });
    expect(processor.findSchemaDefinition("Box<string>", "response")).toEqual({});

    expect(processor.resolveTypeExpression("keyof User")).toEqual({
      type: "string",
      enum: ["id", "name"],
    });
    expect(processor.resolveTypeExpression("User & { extra: boolean }")).toMatchObject({
      type: "object",
      properties: expect.objectContaining({
        extra: { type: "boolean" },
      }),
    });
  });

  it("redirects z.infer<typeof Schema> aliases to the Zod converter when enabled", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-zinfer-alias-"));
    roots.push(root);

    fs.writeFileSync(
      path.join(root, "schemas.ts"),
      [
        'import { z } from "zod";',
        "",
        "export const UserSchema = z.object({",
        "  id: z.string().uuid(),",
        "});",
        "",
        "export type UserAlias = z.infer<typeof UserSchema>;",
      ].join("\n"),
    );

    const processor = new SchemaProcessor(root, ["typescript", "zod"]);
    const schema = processor.findSchemaDefinition("UserAlias", "response");

    expect(schema).toEqual({
      type: "object",
      properties: {
        id: {
          type: "string",
          format: "uuid",
        },
      },
      required: ["id"],
    });
  });

  it("covers leftover private key, compatibility, and unwrap helpers", () => {
    const processor = new SchemaProcessor(process.cwd(), "typescript") as unknown as {
      extractKeysFromTypeNode(node: t.Node | null | undefined): string[];
      areTypesStaticallyCompatible(left: t.Node, right: t.Node): boolean;
      unwrapSchemaProperties(
        schema: Record<string, unknown> | undefined,
      ): Record<string, unknown> | null;
      shouldUseTypeScriptChecker(node: t.Node): boolean;
      addTypeResolutionFallbackDiagnostic(message: string): void;
      typeDefinitions: Record<string, { node?: t.Node }>;
      openapiDefinitions: Record<string, Record<string, unknown>>;
    };

    expect(processor.extractKeysFromTypeNode(null)).toEqual([]);
    expect(
      processor.extractKeysFromTypeNode(
        t.tsUnionType([
          t.tsLiteralType(t.stringLiteral("id")),
          t.tsLiteralType(t.stringLiteral("name")),
        ]),
      ),
    ).toEqual(["id", "name"]);
    processor.typeDefinitions.Keys = {
      node: t.tsUnionType([t.tsLiteralType(t.stringLiteral("a"))]),
    };
    expect(processor.extractKeysFromTypeNode(t.tsTypeReference(t.identifier("Keys")))).toEqual([
      "a",
    ]);
    expect(processor.extractKeysFromTypeNode(t.tsNumberKeyword())).toEqual([]);

    expect(processor.areTypesStaticallyCompatible(t.tsStringKeyword(), t.tsStringKeyword())).toBe(
      true,
    );
    expect(
      processor.areTypesStaticallyCompatible(
        t.tsLiteralType(t.stringLiteral("a")),
        t.tsLiteralType(t.stringLiteral("a")),
      ),
    ).toBe(true);
    expect(
      processor.areTypesStaticallyCompatible(
        t.tsLiteralType(t.stringLiteral("a")),
        t.tsLiteralType(t.stringLiteral("b")),
      ),
    ).toBe(false);
    expect(processor.areTypesStaticallyCompatible(t.tsStringKeyword(), t.tsNumberKeyword())).toBe(
      false,
    );

    expect(processor.unwrapSchemaProperties(undefined)).toBeNull();
    expect(processor.unwrapSchemaProperties({ type: "string" })).toBeNull();
    expect(processor.unwrapSchemaProperties({ properties: { id: { type: "string" } } })).toEqual({
      id: { type: "string" },
    });
    processor.openapiDefinitions.User = { properties: { id: { type: "string" } } };
    expect(processor.unwrapSchemaProperties({ $ref: "#/components/schemas/User" })).toEqual({
      id: { type: "string" },
    });
    expect(
      processor.unwrapSchemaProperties({
        allOf: [
          { properties: { a: { type: "string" } } },
          { properties: { b: { type: "number" } } },
        ],
      }),
    ).toEqual({ a: { type: "string" }, b: { type: "number" } });

    expect(
      processor.shouldUseTypeScriptChecker(
        t.tsConditionalType(
          t.tsStringKeyword(),
          t.tsStringKeyword(),
          t.tsStringKeyword(),
          t.tsNumberKeyword(),
        ),
      ),
    ).toBe(true);
    expect(processor.shouldUseTypeScriptChecker(t.tsStringKeyword())).toBe(false);
    expect(() => processor.addTypeResolutionFallbackDiagnostic("fallback")).not.toThrow();
  });

  it("resolves import types and leftover type-node operators", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-schema-import-type-"));
    roots.push(root);
    fs.writeFileSync(path.join(root, "user.ts"), "export type User = { id: string };\n");
    fs.writeFileSync(
      path.join(root, "schema.ts"),
      'export type Imported = import("./user").User;\nexport type Keys = keyof Imported;\n',
    );

    const processor = new SchemaProcessor(root, "typescript");
    expect(processor.findSchemaDefinition("Imported", "response")).toMatchObject({
      type: "object",
      properties: { id: { type: "string" } },
    });
    expect(processor.findSchemaDefinition("Keys", "response")).toEqual({
      type: "string",
      enum: ["id"],
    });
    expect(processor.resolveTypeExpression("unique symbol")).toBeDefined();
    expect(processor.resolveTypeExpression('import("./missing").Nope')).toEqual({
      type: "object",
    });
  });

  it("covers re-exports, schema id aliases, concrete-definition checks, and interface extends", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-schema-reexport-"));
    roots.push(root);
    const schemaDir = path.join(root, "schemas");
    const libDir = path.join(root, "lib");
    fs.mkdirSync(schemaDir, { recursive: true });
    fs.mkdirSync(libDir, { recursive: true });
    fs.writeFileSync(
      path.join(libDir, "user.ts"),
      [
        "/** @id UserDto */",
        "export type User = { id: string; name?: string };",
        "export interface Named { name: string }",
        "export interface Profile extends Named { id: string }",
        'export enum Status { Draft = "draft", Live = "live" }',
      ].join("\n"),
    );
    fs.writeFileSync(
      path.join(schemaDir, "index.ts"),
      ['export * from "../lib/user";', 'export { User as UserCopy } from "../lib/user";'].join(
        "\n",
      ),
    );

    const processor = new SchemaProcessor(schemaDir, "typescript");
    expect(processor.findSchemaDefinition("User", "response")).toMatchObject({
      type: "object",
      properties: { id: { type: "string" }, name: { type: "string" } },
    });
    expect(processor.findSchemaDefinition("UserDto", "response")).toMatchObject({
      type: "object",
    });
    expect(processor.findSchemaDefinition("Profile", "response")).toMatchObject({
      type: "object",
      properties: expect.objectContaining({
        id: { type: "string" },
        name: { type: "string" },
      }),
    });
    expect(processor.findSchemaDefinition("Status", "response")).toMatchObject({
      type: "string",
      enum: ["draft", "live"],
    });

    const checks = processor as unknown as {
      isConcreteOpenApiDefinition(definition: Record<string, unknown>): boolean;
    };
    expect(checks.isConcreteOpenApiDefinition({ $ref: "#/components/schemas/User" })).toBe(true);
    expect(checks.isConcreteOpenApiDefinition({ properties: { id: { type: "string" } } })).toBe(
      true,
    );
    expect(checks.isConcreteOpenApiDefinition({ enum: ["a"] })).toBe(true);
    expect(checks.isConcreteOpenApiDefinition({ const: 1 })).toBe(true);
    expect(checks.isConcreteOpenApiDefinition({ allOf: [] })).toBe(true);
    expect(checks.isConcreteOpenApiDefinition({ oneOf: [] })).toBe(true);
    expect(checks.isConcreteOpenApiDefinition({ anyOf: [] })).toBe(true);
    expect(checks.isConcreteOpenApiDefinition({ items: { type: "string" } })).toBe(true);
    expect(checks.isConcreteOpenApiDefinition({ prefixItems: [] })).toBe(true);
    expect(checks.isConcreteOpenApiDefinition({ type: "string" })).toBe(true);
    expect(checks.isConcreteOpenApiDefinition({ type: "object" })).toBe(false);
    expect(checks.isConcreteOpenApiDefinition({})).toBe(false);
  });

  it("covers leftover TypeScript checker schema mapping branches", () => {
    const processor = new SchemaProcessor(process.cwd(), "typescript") as unknown as {
      typeScriptTypeToOpenApiSchema(
        type: unknown,
        checker: unknown,
        seen: Set<string>,
        ts: { TypeFlags: Record<string, number>; SymbolFlags: Record<string, number> },
      ): Record<string, unknown>;
    };
    const ts = {
      TypeFlags: {
        StringLike: 1,
        NumberLike: 2,
        BooleanLike: 4,
        BooleanLiteral: 8,
        TemplateLiteral: 16,
        Null: 32,
        Undefined: 64,
        Any: 128,
        Never: 256,
        Unknown: 512,
        Void: 1024,
      },
      SymbolFlags: { Optional: 1 },
    };

    const makeType = (overrides: Record<string, unknown> = {}) => ({
      flags: 0,
      isStringLiteral: () => false,
      isNumberLiteral: () => false,
      isUnion: () => false,
      getNumberIndexType: () => undefined,
      getStringIndexType: () => undefined,
      ...overrides,
    });

    const checker = {
      getApparentType: (type: unknown) => type,
      getPropertiesOfType: () => [],
      typeToString: (type: { label?: string }) => type.label ?? "Type",
      isTupleType: () => false,
      isArrayType: () => false,
      getTypeArguments: () => [],
      getTypeOfSymbolAtLocation: (_symbol: unknown, _decl: unknown) =>
        makeType({ flags: ts.TypeFlags.StringLike, label: "string" }),
    };

    expect(
      processor.typeScriptTypeToOpenApiSchema(
        makeType({ flags: ts.TypeFlags.StringLike, isStringLiteral: () => true, value: "x" }),
        checker,
        new Set(),
        ts,
      ),
    ).toEqual({ type: "string", enum: ["x"] });
    expect(
      processor.typeScriptTypeToOpenApiSchema(
        makeType({ flags: ts.TypeFlags.NumberLike, isNumberLiteral: () => true, value: 3 }),
        checker,
        new Set(),
        ts,
      ),
    ).toEqual({ type: "number", enum: [3] });
    expect(
      processor.typeScriptTypeToOpenApiSchema(
        makeType({ flags: ts.TypeFlags.BooleanLiteral, label: "true" }),
        checker,
        new Set(),
        ts,
      ),
    ).toEqual({ type: "boolean", enum: [true] });
    expect(
      processor.typeScriptTypeToOpenApiSchema(
        makeType({ flags: ts.TypeFlags.TemplateLiteral }),
        checker,
        new Set(),
        ts,
      ),
    ).toEqual({ type: "string" });
    expect(
      processor.typeScriptTypeToOpenApiSchema(
        makeType({ flags: ts.TypeFlags.Null }),
        checker,
        new Set(),
        ts,
      ),
    ).toEqual({ type: "null" });

    const stringMember = makeType({
      flags: ts.TypeFlags.StringLike,
      isStringLiteral: () => true,
      value: "a",
    });
    const nullMember = makeType({ flags: ts.TypeFlags.Null });
    expect(
      processor.typeScriptTypeToOpenApiSchema(
        makeType({
          isUnion: () => true,
          types: [stringMember, nullMember],
        }),
        checker,
        new Set(),
        ts,
      ),
    ).toMatchObject({ type: "string", enum: ["a"], nullable: true });

    const numberMember = makeType({ flags: ts.TypeFlags.NumberLike, label: "number" });
    expect(
      processor.typeScriptTypeToOpenApiSchema(
        makeType({
          isUnion: () => true,
          types: [numberMember, nullMember],
        }),
        checker,
        new Set(),
        ts,
      ),
    ).toMatchObject({ type: "number", nullable: true });

    expect(
      processor.typeScriptTypeToOpenApiSchema(
        makeType({
          isUnion: () => true,
          types: [stringMember, numberMember],
        }),
        checker,
        new Set(),
        ts,
      ),
    ).toMatchObject({ oneOf: expect.any(Array) });

    const tupleChecker = {
      ...checker,
      isTupleType: () => true,
      getTypeArguments: () => [makeType({ flags: ts.TypeFlags.StringLike, label: "string" })],
    };
    expect(
      processor.typeScriptTypeToOpenApiSchema(
        makeType({ label: "tuple" }),
        tupleChecker,
        new Set(),
        ts,
      ),
    ).toMatchObject({ type: "array", items: false, minItems: 1 });

    const arrayChecker = {
      ...checker,
      isArrayType: () => true,
      getTypeArguments: () => [makeType({ flags: ts.TypeFlags.NumberLike, label: "number" })],
    };
    expect(
      processor.typeScriptTypeToOpenApiSchema(
        makeType({ label: "array" }),
        arrayChecker,
        new Set(),
        ts,
      ),
    ).toEqual({ type: "array", items: { type: "number" } });

    const propertyChecker = {
      ...checker,
      getPropertiesOfType: () => [
        {
          getName: () => "id",
          flags: 0,
          valueDeclaration: {},
          declarations: [{}],
        },
        {
          getName: () => "skip",
          flags: 0,
          declarations: [],
        },
        {
          getName: () => "name",
          flags: ts.SymbolFlags.Optional,
          valueDeclaration: {},
        },
      ],
    };
    expect(
      processor.typeScriptTypeToOpenApiSchema(
        makeType({ label: "User" }),
        propertyChecker,
        new Set(),
        ts,
      ),
    ).toMatchObject({
      type: "object",
      properties: { id: { type: "string" }, name: { type: "string" } },
      required: ["id"],
    });

    const indexType = makeType({
      label: "indexed",
      getNumberIndexType: () => makeType({ flags: ts.TypeFlags.StringLike, label: "string" }),
    });
    expect(processor.typeScriptTypeToOpenApiSchema(indexType, checker, new Set(), ts)).toEqual({
      type: "array",
      items: { type: "string" },
    });
    const stringIndex = makeType({
      label: "record",
      getStringIndexType: () => makeType({ flags: ts.TypeFlags.NumberLike, label: "number" }),
    });
    expect(processor.typeScriptTypeToOpenApiSchema(stringIndex, checker, new Set(), ts)).toEqual({
      type: "object",
      additionalProperties: { type: "number" },
    });

    const seen = new Set(["User"]);
    expect(
      processor.typeScriptTypeToOpenApiSchema(makeType({ label: "User" }), checker, seen, ts),
    ).toEqual({ type: "object" });
  });

  it("covers leftover schema index, alias, re-export, and resolveType branches", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-schema-processor-leftover-"));
    roots.push(root);
    const missing = path.join(root, "missing");
    const empty = path.join(root, "empty");
    const schemas = path.join(root, "schemas");
    const nested = path.join(schemas, "nested");
    fs.mkdirSync(empty, { recursive: true });
    fs.mkdirSync(nested, { recursive: true });
    fs.writeFileSync(path.join(empty, "readme.txt"), "no schemas");
    fs.writeFileSync(
      path.join(schemas, "types.ts"),
      [
        "export interface User { id: string; }",
        "export enum Role { Admin = 'admin', User = 'user' }",
        "export type UserId = string;",
      ].join("\n"),
    );
    fs.writeFileSync(
      path.join(schemas, "more.ts"),
      ["export interface User { name: string; }", "export type Count = number;"].join("\n"),
    );
    fs.writeFileSync(
      path.join(schemas, "alias.ts"),
      ["/** @id UserAlias */", "export type UserIdAlias = string;"].join("\n"),
    );
    fs.writeFileSync(
      path.join(schemas, "barrel.ts"),
      ['export * from "./types";', 'export { User as ReUser } from "./types";'].join("\n"),
    );
    fs.writeFileSync(path.join(nested, "child.ts"), "export type Child = string;");
    fs.writeFileSync(path.join(schemas, "broken.ts"), "export type Broken = {");
    fs.writeFileSync(
      path.join(schemas, "internal.ts"),
      ["/** @internal */", "export type HiddenUser = { secret: string };"].join("\n"),
    );

    const diagnostics = new DiagnosticsCollector();
    const processor = new SchemaProcessor(
      [missing, empty, schemas],
      ["typescript", "zod"],
      undefined,
      undefined,
      fs,
      undefined,
      diagnostics,
    );

    expect(processor.findSchemaDefinition("User", "response")).toMatchObject({ type: "object" });
    expect(processor.findSchemaDefinition("Role", "response")).toMatchObject({
      type: "string",
      enum: expect.arrayContaining(["admin", "user"]),
    });
    expect(processor.findSchemaDefinition("UserId", "response")).toEqual({ type: "string" });
    expect(processor.findSchemaDefinition("Child", "response")).toEqual({ type: "string" });
    expect(processor.findSchemaDefinition("Count", "response")).toEqual({ type: "number" });
    expect(processor.hasSchemaCandidate("User")).toBe(true);
    expect(processor.hasSchemaCandidate("MissingType")).toBe(false);
    expect(processor.findSchemaDefinition("Ghost", "response")).toEqual({});
    expect(processor.findSchemaDefinition("HiddenUser", "response")).toMatchObject({
      type: "object",
    });
    expect(processor.getInternalSchemas()).toMatchObject({
      HiddenUser: expect.any(Object),
    });
    expect(processor.getDefinedSchemas()).toMatchObject({
      User: expect.any(Object),
    });

    const again = new SchemaProcessor(
      schemas,
      "typescript",
      undefined,
      undefined,
      fs,
      undefined,
      diagnostics,
    );
    expect(again.hasSchemaCandidate("User")).toBe(true);
    expect(again.findSchemaDefinition("User", "response")).toMatchObject({ type: "object" });
    expect(diagnostics.getAll().some((item) => item.code === "schema-dir-empty")).toBe(true);
  });
});
