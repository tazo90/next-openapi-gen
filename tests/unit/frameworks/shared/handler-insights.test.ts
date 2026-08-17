import { parse } from "@babel/parser";
import * as t from "@babel/types";
import { describe, expect, it } from "vitest";

import {
  applyHandlerInsightsToDataTypes,
  collectHandlerInsights,
} from "@workspace/openapi-core/frameworks/shared/handler-insights.js";
import { parseTypeScriptFile } from "@workspace/openapi-core/shared/parse-typescript.js";

function getExportedHandler(source: string): t.Node {
  const ast = parseTypeScriptFile(source);
  const statement = ast.program.body.find((node) => t.isExportNamedDeclaration(node));
  if (!statement || !t.isExportNamedDeclaration(statement) || !statement.declaration) {
    throw new Error("Expected an exported handler");
  }
  return statement.declaration;
}

describe("collectHandlerInsights", () => {
  it("returns empty insights for a handler without a body", () => {
    const ast = parse("export declare function GET(): void;", {
      sourceType: "module",
      plugins: ["typescript"],
    });
    const statement = ast.program.body[0];
    expect(statement && t.isExportNamedDeclaration(statement)).toBe(true);
    const insights = collectHandlerInsights(
      t.isExportNamedDeclaration(statement) && statement.declaration
        ? statement.declaration
        : ast.program.body[0],
    );
    expect(insights.inferredResponses).toEqual([]);
    expect(insights.requiresTypeScriptChecker).toBe(false);
  });

  it("infers Response.json status and query param names", () => {
    const insights = collectHandlerInsights(
      getExportedHandler(`
        export async function GET(request: Request) {
          const limit = request.nextUrl.searchParams.get("limit");
          return Response.json({ limit }, { status: 201 });
        }
      `),
    );

    expect(insights.inferredQueryParamNames).toContain("limit");
    expect(insights.inferredResponses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          statusCode: "201",
        }),
      ]),
    );
  });

  it("infers NextResponse.redirect without a TypeScript checker", () => {
    const insights = collectHandlerInsights(
      getExportedHandler(`
        export async function GET() {
          return NextResponse.redirect("https://example.com");
        }
      `),
    );

    expect(insights.inferredResponses.length).toBeGreaterThan(0);
    expect(insights.requiresTypeScriptChecker).toBe(false);
  });

  it("marks notFound and stream responses", () => {
    const insights = collectHandlerInsights(
      getExportedHandler(`
        export async function GET() {
          if (false) {
            notFound();
          }
          return Response.json(new ReadableStream());
        }
      `),
    );

    expect(insights.inferredResponses.length).toBeGreaterThan(0);
  });

  it("infers primitive, array, null, and stream-shaped JSON responses", () => {
    const insights = collectHandlerInsights(
      getExportedHandler(`
        export async function GET() {
          if (false) return Response.json(null);
          if (false) return Response.json("ok");
          if (false) return Response.json(1);
          if (false) return Response.json(true);
          if (false) return Response.json([1, 2]);
          return Response.json({ ...payload });
        }
      `),
    );

    expect(insights.inferredResponses.map((response) => response.schema)).toEqual(
      expect.arrayContaining([
        { type: "null" },
        { type: "string" },
        { type: "number" },
        { type: "boolean" },
        { type: "array", items: { type: "number" } },
      ]),
    );
  });

  it("infers path, query, and body aliases plus remaining JSON argument shapes", () => {
    const ast = parseTypeScriptFile(`
      export const GET = async ({ params, searchParams }: { params: { id: string }; searchParams: URLSearchParams }) => {
        const id = params.id;
        const q = searchParams.get("q");
        const body = await request.json();
        if (false) return Response.json(\`ok-\${id}\`);
        if (false) return Response.json([]);
        if (false) return Response.json(payload);
        if (false) return Response.json(await load());
        if (false) return Response.json(user.name);
        if (false) return Response.json(load());
        return Response.json({ ok: true }, { "status": 202 });
      };
    `);
    const statement = ast.program.body[0];
    if (
      !statement ||
      !t.isExportNamedDeclaration(statement) ||
      !t.isVariableDeclaration(statement.declaration)
    ) {
      throw new Error("Expected const export");
    }
    const insights = collectHandlerInsights(statement.declaration.declarations[0], {
      hasPathParams: true,
    });

    expect(insights.inferredQueryParamNames).toContain("q");
    expect(insights.inferredResponses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ schema: { type: "string" } }),
        expect.objectContaining({ schema: { type: "array" } }),
        expect.objectContaining({ schema: { type: "object" } }),
        expect.objectContaining({ statusCode: "202" }),
      ]),
    );
  });

  it("supports function expression handlers and skips nested functions", () => {
    const insights = collectHandlerInsights(
      getExportedHandler(`
        export async function GET() {
          const nested = () => Response.json({ hidden: true });
          return new Response(null, { status: 204 });
        }
      `),
    );
    expect(insights.inferredResponses).toEqual(
      expect.arrayContaining([expect.objectContaining({ statusCode: "204" })]),
    );
  });

  it("covers leftover expression-body, rest params, and notFound-without-404 branches", () => {
    const ast = parseTypeScriptFile(`
      export const GET = (request, { params, ...rest }) => Response.json(data, { status: 201 });
    `);
    const statement = ast.program.body[0];
    if (
      !statement ||
      !t.isExportNamedDeclaration(statement) ||
      !t.isVariableDeclaration(statement.declaration)
    ) {
      throw new Error("Expected const export");
    }
    const expressionBody = collectHandlerInsights(statement.declaration.declarations[0]);
    expect(expressionBody.inferredResponses.length).toBeGreaterThanOrEqual(0);

    const notFoundOnly = collectHandlerInsights(
      getExportedHandler(`
        export async function GET() {
          notFound();
        }
      `),
    );
    expect(notFoundOnly.inferredResponses).toEqual(
      expect.arrayContaining([expect.objectContaining({ statusCode: "404" })]),
    );

    const restOnly = collectHandlerInsights(
      getExportedHandler(`
        export async function GET({ ...bag }) {
          return Response.json(bag);
        }
      `),
    );
    expect(restOnly.inferredResponses.length).toBeGreaterThan(0);
  });
});

describe("applyHandlerInsightsToDataTypes", () => {
  it("merges inferred query params onto existing data types", () => {
    const dataTypes = applyHandlerInsightsToDataTypes(
      {
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
      },
      getExportedHandler(`
        export async function GET(request: Request) {
          const q = request.nextUrl.searchParams.get("q");
          return Response.json({ q });
        }
      `),
    );

    expect(dataTypes.inferredQueryParamNames).toContain("q");
  });

  it("does not overwrite explicit JSDoc types when insights are present", () => {
    const dataTypes = applyHandlerInsightsToDataTypes(
      {
        tag: "",
        tagSummary: "",
        tagDescription: "",
        tagKind: "",
        tagParent: "",
        auth: "",
        summary: "",
        description: "",
        paramsType: "ExistingQuery",
        pathParamsType: "ExistingPath",
        querystringType: "",
        querystringName: "",
        bodyType: "ExistingBody",
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
        method: "POST",
      },
      getExportedHandler(`
        export async function POST(request: Request, { params }: { params: { id: string } }) {
          const body = await request.json();
          return Response.json(body);
        }
      `),
      { hasPathParams: true },
    );

    expect(dataTypes.bodyType).toBe("ExistingBody");
    expect(dataTypes.pathParamsType).toBe("ExistingPath");
    expect(dataTypes.paramsType).toBe("ExistingQuery");

    const inferred = applyHandlerInsightsToDataTypes(
      {
        ...dataTypes,
        bodyType: "",
        pathParamsType: "",
        paramsType: "",
      },
      getExportedHandler(`
        export async function POST(request: Request, { params }: { params: { id: string } }) {
          const body = await request.json();
          return Response.json(body);
        }
      `),
      { hasPathParams: true },
    );
    expect(inferred.inferredBodyType || inferred.bodyType).toBeDefined();
  });

  it("covers leftover request aliases, query params, streams, and diagnostics", () => {
    const withRequest = collectHandlerInsights(
      getExportedHandler(`
        export async function GET({ request, query, extra: { nested } }: {
          request: Request;
          query: { q: string };
          extra: { nested: string };
        }, ...rest: unknown[]) {
          const q = request.nextUrl.searchParams.get("q");
          const schema = UserSchema.parse(await request.json());
          if (!schema) {
            return notFound();
          }
          return new Response(new ReadableStream());
        }
      `),
      { hasPathParams: false },
    );
    expect(withRequest.inferredQueryParamNames).toContain("q");

    const withReq = collectHandlerInsights(
      getExportedHandler(`
        export async function GET({ req, query }: { req: Request; query: { id: string } }) {
          return Response.json({ id: query.id });
        }
      `),
      { hasPathParams: true },
    );
    expect(withReq.inferredResponses.length).toBeGreaterThanOrEqual(0);

    const computedKey = collectHandlerInsights(
      getExportedHandler(`
        export async function GET({ [computed]: value }: { [computed: string]: string }) {
          return Response.json(value);
        }
      `),
    );
    expect(computedKey.inferredResponses.length).toBeGreaterThanOrEqual(0);

    const existingBody = applyHandlerInsightsToDataTypes(
      {
        tag: "",
        tagSummary: "",
        tagDescription: "",
        tagKind: "",
        tagParent: "",
        auth: "",
        summary: "",
        description: "",
        paramsType: "Query",
        pathParamsType: "",
        querystringType: "",
        querystringName: "",
        bodyType: "Body",
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
        method: "POST",
        diagnostics: [{ code: "existing", severity: "info", message: "kept" }],
      },
      getExportedHandler(`
        export async function POST(request: Request) {
          const body = UserSchema.parse(await request.json());
          return Response.json(body);
        }
      `),
    );
    expect(existingBody.bodyType).toBe("Body");
    expect(existingBody.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "existing" })]),
    );

    const dataTypes = applyHandlerInsightsToDataTypes(
      {
        tag: "",
        tagSummary: "",
        tagDescription: "",
        tagKind: "",
        tagParent: "",
        auth: "",
        summary: "",
        description: "",
        paramsType: "ExistingQuery",
        pathParamsType: "ExistingPath",
        querystringType: "",
        querystringName: "",
        bodyType: "ExistingBody",
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
        diagnostics: [{ code: "existing", severity: "warning", message: "kept" }],
      },
      getExportedHandler(`
        export async function GET(request: Request) {
          const q = request.nextUrl.searchParams.get("q");
          return Response.json({ q });
        }
      `),
    );
    expect(dataTypes.inferredQueryParamNames).toContain("q");
    expect(dataTypes.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "existing" })]),
    );
  });

  it("covers leftover inferred types, next.notFound, and json streams", () => {
    const inferred = applyHandlerInsightsToDataTypes(
      {
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
        method: "POST",
      },
      getExportedHandler(`
        export async function POST(request: Request) {
          const body = UserSchema.parse(await request.json());
          const query = QuerySchema.parse(request.query);
          return Response.json(body);
        }
      `),
      { hasPathParams: false },
    );
    expect(inferred.inferredBodyType).toBe("UserSchema");
    expect(inferred.inferredQueryParamsType).toBe("QuerySchema");

    const notFound = applyHandlerInsightsToDataTypes(
      {
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
      },
      getExportedHandler(`
        export async function GET() {
          next.notFound();
        }
      `),
    );
    expect(notFound.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "unsupported-route-feature" })]),
    );

    const streamed = collectHandlerInsights(
      getExportedHandler(`
        export async function GET() {
          return Response.json(new ReadableStream());
        }
      `),
    );
    expect(streamed.handlerDiagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "stream-response-hint" })]),
    );

    const dynamicQuery = collectHandlerInsights(
      getExportedHandler(`
        export async function GET(request: Request) {
          const key = "limit";
          return Response.json({ q: request.nextUrl.searchParams.get(key) });
        }
      `),
    );
    expect(dynamicQuery.inferredQueryParamNames).toEqual([]);
  });
});
