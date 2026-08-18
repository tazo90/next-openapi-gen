import * as t from "@babel/types";

import type {
  DataTypes,
  InferredResponseDefinition,
  OpenApiSchemaLike,
} from "../../shared/types.js";

export type HandlerValueSource = "pathParamsType" | "queryParamsType" | "bodyType";

type HandlerParsedSchemas = Partial<Record<HandlerValueSource, string>> & {
  notFoundResponse?: boolean;
  streamResponse?: boolean;
};

export type HandlerInsights = {
  inferredBodyType: string;
  inferredPathParamsType: string;
  inferredQueryParamNames: string[];
  inferredQueryParamsType: string;
  inferredResponses: InferredResponseDefinition[];
  handlerDiagnostics: NonNullable<DataTypes["diagnostics"]>;
  requiresTypeScriptChecker: boolean;
};

type HandlerInsightOptions = {
  hasPathParams?: boolean | undefined;
};

export function applyHandlerInsightsToDataTypes(
  dataTypes: DataTypes,
  handlerNode: t.Node,
  options: HandlerInsightOptions = {},
): DataTypes {
  const insights = collectHandlerInsights(handlerNode, options);
  return {
    ...dataTypes,
    ...(insights.inferredBodyType && !dataTypes.bodyType
      ? { inferredBodyType: insights.inferredBodyType }
      : {}),
    ...(insights.inferredPathParamsType && !dataTypes.pathParamsType
      ? { inferredPathParamsType: insights.inferredPathParamsType }
      : {}),
    ...(insights.inferredQueryParamsType && !dataTypes.paramsType
      ? { inferredQueryParamsType: insights.inferredQueryParamsType }
      : {}),
    ...(insights.inferredQueryParamNames.length > 0
      ? { inferredQueryParamNames: insights.inferredQueryParamNames }
      : {}),
    ...(insights.inferredResponses.length > 0
      ? { inferredResponses: insights.inferredResponses }
      : {}),
    ...(insights.handlerDiagnostics.length > 0
      ? { diagnostics: [...(dataTypes.diagnostics ?? []), ...insights.handlerDiagnostics] }
      : {}),
  };
}

export function collectHandlerInsights(
  handlerNode: t.Node,
  options: HandlerInsightOptions = {},
): HandlerInsights {
  const functionLike = getFunctionLikeNode(handlerNode);

  if (!functionLike || !functionLike.body) {
    return emptyHandlerInsights();
  }

  const queryParamNames = new Set<string>();
  const parsedSchemas: HandlerParsedSchemas = {};
  const inferredResponses: InferredResponseDefinition[] = [];
  let requiresTypeScriptChecker = false;
  const aliases = new Map<string, HandlerValueSource>();
  seedParameterAliases(functionLike, aliases, options);

  const handleReturnExpression = (expression: t.Expression) => {
    const inferredResponse = inferResponseFromExpression(expression);
    if (inferredResponse) {
      inferredResponses.push(inferredResponse);
    }
    if (requiresCheckerForExpression(expression)) {
      requiresTypeScriptChecker = true;
    }
  };

  visitHandlerNode(
    functionLike.body,
    queryParamNames,
    aliases,
    parsedSchemas,
    handleReturnExpression,
    options,
  );

  if (!t.isBlockStatement(functionLike.body) && requiresCheckerForExpression(functionLike.body)) {
    requiresTypeScriptChecker = true;
  }

  if (
    parsedSchemas.notFoundResponse &&
    !inferredResponses.some((response) => response.statusCode === "404")
  ) {
    inferredResponses.push({
      statusCode: "404",
      description: "Not Found",
      source: "typescript",
    });
  }

  if (parsedSchemas.streamResponse && !inferredResponses.some((response) => response.contentType)) {
    inferredResponses.push({
      statusCode: "200",
      contentType: "text/event-stream",
      schema: { type: "string" },
      description: "Streaming response",
      source: "typescript",
    });
  }

  return {
    inferredBodyType: parsedSchemas.bodyType ?? "",
    inferredPathParamsType: parsedSchemas.pathParamsType ?? "",
    inferredQueryParamNames: Array.from(queryParamNames),
    inferredQueryParamsType: parsedSchemas.queryParamsType ?? "",
    inferredResponses,
    handlerDiagnostics: buildHandlerDiagnostics(parsedSchemas),
    requiresTypeScriptChecker,
  };
}

function emptyHandlerInsights(): HandlerInsights {
  return {
    inferredBodyType: "",
    inferredPathParamsType: "",
    inferredQueryParamNames: [],
    inferredQueryParamsType: "",
    inferredResponses: [],
    handlerDiagnostics: [],
    requiresTypeScriptChecker: false,
  };
}

function buildHandlerDiagnostics(
  parsedSchemas: HandlerParsedSchemas,
): NonNullable<DataTypes["diagnostics"]> {
  const diagnostics: NonNullable<DataTypes["diagnostics"]> = [];

  if (parsedSchemas.notFoundResponse) {
    diagnostics.push({
      code: "unsupported-route-feature",
      severity: "info",
      message:
        "Handler calls notFound(); add an explicit @response for 404 if you want it documented in OpenAPI.",
      metadata: {
        suggestedFix:
          "Add @response 404 <SchemaName> or an @openapi override for the 404 response.",
      },
    });
  }

  if (parsedSchemas.streamResponse) {
    diagnostics.push({
      code: "stream-response-hint",
      severity: "info",
      message:
        "Handler appears to return a streaming body. Consider @responseContentType text/event-stream (or another sequential media type) with @itemSchema for accurate OpenAPI output.",
      metadata: {
        suggestedFix: "Add @responseContentType, @itemSchema, and optional @itemEncoding tags.",
      },
    });
  }

  return diagnostics;
}

function seedParameterAliases(
  functionLike: t.FunctionDeclaration | t.FunctionExpression | t.ArrowFunctionExpression,
  aliases: Map<string, HandlerValueSource>,
  options: HandlerInsightOptions,
): void {
  for (const param of functionLike.params) {
    if (t.isIdentifier(param)) {
      aliases.set(param.name, "queryParamsType");
      continue;
    }

    if (!t.isObjectPattern(param)) {
      continue;
    }

    for (const property of param.properties) {
      if (!t.isObjectProperty(property)) {
        continue;
      }

      const keyName = getPropertyName(property.key);
      if (!keyName) {
        continue;
      }

      const value = property.value;
      const source = getSourceForParameterProperty(keyName, options);
      if (source && t.isIdentifier(value)) {
        aliases.set(value.name, source);
      }
    }
  }
}

function getSourceForParameterProperty(
  propertyName: string,
  options: HandlerInsightOptions,
): HandlerValueSource | null {
  if (propertyName === "params") {
    return "pathParamsType";
  }

  if (propertyName === "request" || propertyName === "req") {
    return "queryParamsType";
  }

  if (propertyName === "query") {
    return options.hasPathParams ? "pathParamsType" : "queryParamsType";
  }

  return null;
}

function visitHandlerNode(
  node: t.Node | null | undefined,
  queryParamNames: Set<string>,
  aliases: Map<string, HandlerValueSource>,
  parsedSchemas: HandlerParsedSchemas,
  onReturnExpression: (expression: t.Expression) => void,
  options: HandlerInsightOptions,
): void {
  if (!node) {
    return;
  }

  if (t.isCallExpression(node)) {
    const name = getSearchParamName(node);
    if (name) {
      queryParamNames.add(name);
    }

    const parsedSchema = getParsedSchemaFromCall(node, aliases, options);
    if (parsedSchema) {
      parsedSchemas[parsedSchema.source] ??= parsedSchema.schemaName;
    }

    if (isNotFoundCall(node)) {
      parsedSchemas.notFoundResponse = true;
    }

    if (isReadableStreamResponse(node)) {
      parsedSchemas.streamResponse = true;
    }
  }

  if (t.isVariableDeclarator(node) && t.isIdentifier(node.id) && node.init) {
    const source = getHandlerValueSource(node.init, aliases, options);
    if (source) {
      aliases.set(node.id.name, source);
    }
  }

  if (t.isReturnStatement(node) && node.argument) {
    if (t.isCallExpression(node.argument) && isReadableStreamResponse(node.argument)) {
      parsedSchemas.streamResponse = true;
    }
    onReturnExpression(node.argument);
    return;
  }

  if (isNestedFunctionNode(node)) {
    return;
  }

  const visitorKeys = t.VISITOR_KEYS[node.type];
  if (!visitorKeys) {
    return;
  }

  visitorKeys.forEach((key) => {
    const value = node[key as keyof typeof node];
    if (Array.isArray(value)) {
      value.forEach((child) => {
        if (isTraversableNode(child)) {
          visitHandlerNode(
            child,
            queryParamNames,
            aliases,
            parsedSchemas,
            onReturnExpression,
            options,
          );
        }
      });
      return;
    }

    if (isTraversableNode(value)) {
      visitHandlerNode(value, queryParamNames, aliases, parsedSchemas, onReturnExpression, options);
    }
  });
}

function getSearchParamName(node: t.CallExpression): string | null {
  if (!t.isMemberExpression(node.callee) || !t.isIdentifier(node.callee.property)) {
    return null;
  }

  const methodName = node.callee.property.name;
  if (methodName !== "get" && methodName !== "getAll" && methodName !== "has") {
    return null;
  }

  if (!isSearchParamsExpression(node.callee.object)) {
    return null;
  }

  const firstArgument = node.arguments[0];
  return t.isStringLiteral(firstArgument) ? firstArgument.value : null;
}

function getParsedSchemaFromCall(
  node: t.CallExpression,
  aliases: Map<string, HandlerValueSource>,
  options: HandlerInsightOptions,
): { schemaName: string; source: HandlerValueSource } | null {
  if (!t.isMemberExpression(node.callee) || !t.isIdentifier(node.callee.property)) {
    return null;
  }

  const methodName = node.callee.property.name;
  if (methodName !== "parse" && methodName !== "safeParse") {
    return null;
  }

  if (!t.isIdentifier(node.callee.object)) {
    return null;
  }

  const firstArgument = node.arguments[0];
  if (!firstArgument || t.isArgumentPlaceholder(firstArgument)) {
    return null;
  }

  const source = getHandlerValueSource(firstArgument, aliases, options);
  return source ? { schemaName: node.callee.object.name, source } : null;
}

function getHandlerValueSource(
  node: t.Node,
  aliases: Map<string, HandlerValueSource>,
  options: HandlerInsightOptions,
): HandlerValueSource | null {
  if (t.isIdentifier(node)) {
    return aliases.get(node.name) ?? null;
  }

  if (t.isAwaitExpression(node)) {
    return getHandlerValueSource(node.argument, aliases, options);
  }

  if (isContextParamsExpression(node)) {
    return "pathParamsType";
  }

  if (isRequestQueryExpression(node)) {
    return options.hasPathParams ? "pathParamsType" : "queryParamsType";
  }

  if (
    isJsonBodyExpression(node) ||
    isFormDataExpression(node) ||
    (t.isMemberExpression(node) && t.isIdentifier(node.property, { name: "body" }))
  ) {
    return "bodyType";
  }

  if (containsSearchParams(node)) {
    return "queryParamsType";
  }

  return null;
}

function isContextParamsExpression(node: t.Node): boolean {
  return (
    (t.isMemberExpression(node) &&
      t.isIdentifier(node.property, { name: "params" }) &&
      t.isIdentifier(node.object)) ||
    isNamedCall(node, "getRouterParam") ||
    isMemberCall(node, "param")
  );
}

function isRequestQueryExpression(node: t.Node): boolean {
  return (
    (t.isMemberExpression(node) &&
      t.isIdentifier(node.property, { name: "query" }) &&
      t.isIdentifier(node.object)) ||
    isNamedCall(node, "getQuery")
  );
}

function isJsonBodyExpression(node: t.Node): boolean {
  return isRequestMethodCall(node, "json") || isNamedCall(node, "readBody");
}

function isNamedCall(node: t.Node, name: string): boolean {
  return t.isCallExpression(node) && t.isIdentifier(node.callee, { name });
}

function isMemberCall(node: t.Node, methodName: string): boolean {
  return (
    t.isCallExpression(node) &&
    t.isMemberExpression(node.callee) &&
    t.isIdentifier(node.callee.property, { name: methodName })
  );
}

function isFormDataExpression(node: t.Node): boolean {
  return isRequestMethodCall(node, "formData");
}

function isRequestMethodCall(node: t.Node, methodName: string): boolean {
  return (
    t.isCallExpression(node) &&
    t.isMemberExpression(node.callee) &&
    t.isIdentifier(node.callee.property, { name: methodName }) &&
    (t.isIdentifier(node.callee.object) ||
      (t.isMemberExpression(node.callee.object) &&
        t.isIdentifier(node.callee.object.property, { name: "req" })))
  );
}

function containsSearchParams(node: t.Node): boolean {
  if (isSearchParamsExpression(node)) {
    return true;
  }

  const visitorKeys = t.VISITOR_KEYS[node.type];
  if (!visitorKeys) {
    return false;
  }

  return visitorKeys.some((key) => {
    const value = node[key as keyof typeof node];
    if (Array.isArray(value)) {
      return value.some((child) => isTraversableNode(child) && containsSearchParams(child));
    }

    return isTraversableNode(value) && containsSearchParams(value);
  });
}

function isSearchParamsExpression(node: t.Node): boolean {
  return (
    (t.isMemberExpression(node) && t.isIdentifier(node.property, { name: "searchParams" })) ||
    (t.isIdentifier(node) && node.name === "searchParams")
  );
}

function isNotFoundCall(node: t.CallExpression): boolean {
  return (
    t.isIdentifier(node.callee, { name: "notFound" }) ||
    (t.isMemberExpression(node.callee) &&
      t.isIdentifier(node.callee.property, { name: "notFound" }) &&
      t.isIdentifier(node.callee.object, { name: "next" }))
  );
}

function isReadableStreamResponse(node: t.CallExpression): boolean {
  if (!t.isMemberExpression(node.callee) || !t.isIdentifier(node.callee.property)) {
    return false;
  }

  if (node.callee.property.name !== "json") {
    return false;
  }

  const firstArgument = node.arguments[0];
  return Boolean(firstArgument && containsReadableStream(firstArgument));
}

function containsReadableStream(node: t.Node): boolean {
  if (t.isNewExpression(node) && t.isIdentifier(node.callee, { name: "ReadableStream" })) {
    return true;
  }

  const visitorKeys = t.VISITOR_KEYS[node.type];
  if (!visitorKeys) {
    return false;
  }

  return visitorKeys.some((key) => {
    const value = node[key as keyof typeof node];
    if (Array.isArray(value)) {
      return value.some((child) => isTraversableNode(child) && containsReadableStream(child));
    }

    return isTraversableNode(value) && containsReadableStream(value);
  });
}

function requiresCheckerForExpression(expression: t.Expression): boolean {
  if (t.isCallExpression(expression) && t.isMemberExpression(expression.callee)) {
    const property = expression.callee.property;
    if (!t.isIdentifier(property)) {
      return false;
    }

    const object = expression.callee.object;
    if (!t.isIdentifier(object)) {
      return false;
    }

    const isResponseFactory = object.name === "Response" || object.name === "NextResponse";
    if (!isResponseFactory) {
      return false;
    }

    return property.name === "json" && Boolean(expression.arguments[1]);
  }

  return t.isNewExpression(expression) && t.isIdentifier(expression.callee, { name: "Response" });
}

function inferResponseFromExpression(
  expression: t.Expression,
): InferredResponseDefinition | undefined {
  if (isRedirectResponse(expression)) {
    return {
      statusCode: "307",
      description: "Redirect response",
      source: "typescript",
    };
  }

  if (t.isNewExpression(expression) && t.isIdentifier(expression.callee, { name: "Response" })) {
    const statusCode = getLiteralResponseStatusCode(expression.arguments[1]);
    if (statusCode === "204") {
      return { statusCode, source: "typescript" };
    }
  }

  if (!t.isCallExpression(expression) || !t.isMemberExpression(expression.callee)) {
    return undefined;
  }

  if (!t.isIdentifier(expression.callee.property, { name: "json" })) {
    return undefined;
  }

  const calleeObject = expression.callee.object;
  if (!t.isIdentifier(calleeObject)) {
    return undefined;
  }

  if (calleeObject.name !== "Response" && calleeObject.name !== "NextResponse") {
    return undefined;
  }

  const statusCode = getLiteralResponseStatusCode(expression.arguments[1]);
  const schema = inferSchemaFromJsonArgument(expression.arguments[0]);
  if (!schema && statusCode === "204") {
    return {
      statusCode,
      source: "typescript",
    };
  }

  if (!schema) {
    return undefined;
  }

  return {
    statusCode: statusCode || "200",
    schema,
    source: "typescript",
  };
}

function isRedirectResponse(expression: t.Expression): boolean {
  if (!t.isCallExpression(expression) || !t.isMemberExpression(expression.callee)) {
    return false;
  }

  return (
    t.isIdentifier(expression.callee.property, { name: "redirect" }) &&
    t.isIdentifier(expression.callee.object) &&
    (expression.callee.object.name === "Response" ||
      expression.callee.object.name === "NextResponse")
  );
}

function getLiteralResponseStatusCode(
  argument: t.CallExpression["arguments"][number] | undefined,
): string | undefined {
  if (!argument || !t.isObjectExpression(argument)) {
    return undefined;
  }

  for (const property of argument.properties) {
    if (!t.isObjectProperty(property) || !isPropertyNamed(property, "status")) {
      continue;
    }

    const value = property.value;
    if (t.isNumericLiteral(value)) {
      return String(value.value);
    }
  }

  return undefined;
}

function inferSchemaFromJsonArgument(
  argument: t.CallExpression["arguments"][number] | undefined,
): OpenApiSchemaLike | undefined {
  if (!argument) {
    return { type: "object" };
  }

  if (t.isSpreadElement(argument)) {
    return undefined;
  }

  if (t.isNullLiteral(argument)) {
    return { type: "null" };
  }

  if (t.isStringLiteral(argument) || t.isTemplateLiteral(argument)) {
    return { type: "string" };
  }

  if (t.isNumericLiteral(argument)) {
    return { type: "number" };
  }

  if (t.isBooleanLiteral(argument)) {
    return { type: "boolean" };
  }

  if (t.isArrayExpression(argument)) {
    const itemSchema = argument.elements
      .map((element) =>
        element && !t.isSpreadElement(element) ? inferSchemaFromJsonArgument(element) : undefined,
      )
      .find((schema): schema is OpenApiSchemaLike => Boolean(schema));
    return {
      type: "array",
      ...(itemSchema ? { items: itemSchema } : {}),
    };
  }

  if (t.isObjectExpression(argument)) {
    return { type: "object" };
  }

  if (
    t.isIdentifier(argument) ||
    t.isCallExpression(argument) ||
    t.isMemberExpression(argument) ||
    t.isAwaitExpression(argument)
  ) {
    return { type: "object" };
  }

  return undefined;
}

function isPropertyNamed(property: t.ObjectProperty, name: string): boolean {
  const propertyName = getPropertyName(property.key);
  return propertyName === name;
}

function getPropertyName(key: t.Node): string | null {
  if (t.isIdentifier(key)) {
    return key.name;
  }

  if (t.isStringLiteral(key)) {
    return key.value;
  }

  return null;
}

function getFunctionLikeNode(
  handlerNode: t.Node,
): t.FunctionDeclaration | t.FunctionExpression | t.ArrowFunctionExpression | null {
  if (t.isFunctionDeclaration(handlerNode) || t.isFunctionExpression(handlerNode)) {
    return handlerNode;
  }

  if (t.isVariableDeclarator(handlerNode) && t.isArrowFunctionExpression(handlerNode.init)) {
    return handlerNode.init;
  }

  return null;
}

function isNestedFunctionNode(node: t.Node): boolean {
  return (
    t.isFunctionDeclaration(node) ||
    t.isFunctionExpression(node) ||
    t.isArrowFunctionExpression(node) ||
    t.isObjectMethod(node) ||
    t.isClassMethod(node)
  );
}

function isTraversableNode(value: unknown): value is t.Node {
  if (!value || typeof value !== "object" || !("type" in value)) {
    return false;
  }

  const { type } = value;
  return typeof type === "string" && type in t.VISITOR_KEYS;
}
