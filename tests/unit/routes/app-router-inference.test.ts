import * as t from "@babel/types";
import { describe, expect, it } from "vitest";

import { parseTypeScriptFile } from "@workspace/openapi-core/shared/parse-typescript.js";
import type { DataTypes } from "@workspace/openapi-core/shared/types.js";

import {
  analyzeHandler,
  inferResponseTypeFromHandler,
  stringifyTypeNode,
} from "../../../packages/openapi-framework-next/src/routes/app-router-inference.js";

function emptyDataTypes(overrides: Partial<DataTypes> = {}): DataTypes {
  return {
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
    isOpenApi: true,
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
    method: "GET",
    ...overrides,
  };
}

function getExportedHandler(source: string): t.Node {
  const ast = parseTypeScriptFile(source);
  const statement = ast.program.body.find((node) => t.isExportNamedDeclaration(node));
  if (!statement || !t.isExportNamedDeclaration(statement) || !statement.declaration) {
    throw new Error("Expected an exported handler");
  }
  return statement.declaration;
}

describe("analyzeHandler", () => {
  it("keeps an explicit response annotation as a direct result", () => {
    const result = analyzeHandler(
      emptyDataTypes({ responseType: "User" }),
      getExportedHandler("export async function GET() { return Response.json({}); }"),
    );
    expect(result.kind).toBe("direct");
  });

  it("infers NextResponse annotation types without a checker", () => {
    const result = analyzeHandler(
      emptyDataTypes(),
      getExportedHandler(
        "export async function GET(): Promise<NextResponse<User>> { return null as any; }",
      ),
    );
    expect(result).toMatchObject({
      kind: "direct",
      dataTypes: { responseType: "User" },
    });
  });

  it("infers Response.json without a status as a direct inferred response", () => {
    const result = analyzeHandler(
      emptyDataTypes(),
      getExportedHandler("export async function GET() { return Response.json({ ok: true }); }"),
    );
    expect(result.kind).toBe("direct");
  });

  it("treats 204 success codes as already documented", () => {
    const result = analyzeHandler(
      emptyDataTypes({ successCode: "204" }),
      getExportedHandler(
        "export async function DELETE() { return new Response(null, { status: 204 }); }",
      ),
    );
    expect(result.kind).toBe("direct");
  });

  it("merges inferred body, path, query, and handler diagnostics", () => {
    const result = analyzeHandler(
      emptyDataTypes({ diagnostics: [] }),
      getExportedHandler(`
        export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
          const body = UserSchema.parse(await request.json());
          const params = PathSchema.parse(await context.params);
          const query = QuerySchema.parse(request.nextUrl.searchParams);
          notFound();
          return Response.json(new ReadableStream());
        }
      `),
    );

    expect(result.dataTypes.inferredBodyType).toBe("UserSchema");
    expect(result.dataTypes.inferredPathParamsType).toBe("PathSchema");
    expect(result.dataTypes.inferredQueryParamsType).toBe("QuerySchema");
    expect(
      result.dataTypes.diagnostics?.some(
        (diagnostic) => diagnostic.code === "unsupported-route-feature",
      ),
    ).toBe(true);
  });

  it("marks Response.json with a dynamic status as needing the checker", () => {
    const result = analyzeHandler(
      emptyDataTypes(),
      getExportedHandler(`
        export async function GET() {
          const options = { status: 201 };
          return Response.json({ ok: true }, options);
        }
      `),
    );
    expect(result.kind).toBe("needs-checker");
  });
});

describe("inferResponseTypeFromHandler", () => {
  it("reads Promise<NextResponse<T>> and array type nodes", () => {
    expect(
      inferResponseTypeFromHandler(
        getExportedHandler(
          "export async function GET(): Promise<NextResponse<User[]>> { return null as any; }",
        ),
      ),
    ).toBe("User[]");
  });

  it("returns an empty string without a return annotation", () => {
    expect(
      inferResponseTypeFromHandler(
        getExportedHandler("export async function GET() { return Response.json({}); }"),
      ),
    ).toBe("");
  });
});

describe("stringifyTypeNode", () => {
  it("stringifies generic and array type nodes", () => {
    const ast = parseTypeScriptFile("type Example = NextResponse<User[]>;");
    const statement = ast.program.body[0];
    if (!statement || !t.isTSTypeAliasDeclaration(statement)) {
      throw new Error("Expected a type alias");
    }
    expect(stringifyTypeNode(statement.typeAnnotation)).toBe("NextResponse<User[]>");
  });
});
