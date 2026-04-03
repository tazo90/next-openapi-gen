import * as ts from "typescript";

import { getTypeScriptProject } from "../shared/typescript-project.js";
import type { Diagnostic, InferredResponseDefinition, OpenApiSchemaLike } from "../shared/types.js";

type InferredRouteResponses = {
  responses: InferredResponseDefinition[];
  diagnostics: Diagnostic[];
};

const exportNodeCache = new WeakMap<ts.SourceFile, Map<string, ts.Node>>();
const inferredResponseCache = new WeakMap<ts.SourceFile, Map<string, InferredRouteResponses>>();

export function inferResponsesForExport(
  filePath: string,
  exportName: string,
): InferredRouteResponses {
  return (
    inferResponsesForExports(filePath, [exportName]).get(exportName) ?? {
      responses: [],
      diagnostics: [],
    }
  );
}

export function inferResponsesForExports(
  filePath: string,
  exportNames: readonly string[],
): Map<string, InferredRouteResponses> {
  const project = getTypeScriptProject(filePath);
  const sourceFile = project.program.getSourceFile(filePath);
  if (!sourceFile) {
    return new Map();
  }

  const exportNodeMap = getExportNodeMap(sourceFile);
  const requestedExportNames = Array.from(
    new Set(exportNames.filter((exportName) => exportNodeMap.has(exportName))),
  );
  if (requestedExportNames.length === 0) {
    return new Map();
  }

  const cachedResponseMap = getOrCreateInferredResponseCache(sourceFile);
  const missingExportNames = requestedExportNames.filter(
    (exportName) => !cachedResponseMap.has(exportName),
  );
  if (missingExportNames.length > 0) {
    inferResponsesForSourceFile(
      sourceFile,
      exportNodeMap,
      missingExportNames,
      project.checker,
    ).forEach((result, exportName) => {
      cachedResponseMap.set(exportName, result);
    });
  }

  return new Map(
    requestedExportNames.flatMap((exportName) => {
      const cachedResponse = cachedResponseMap.get(exportName);
      return cachedResponse ? [[exportName, cachedResponse] as const] : [];
    }),
  );
}

function getExportNodeMap(sourceFile: ts.SourceFile): Map<string, ts.Node> {
  const cachedNodes = exportNodeCache.get(sourceFile);
  if (cachedNodes) {
    return cachedNodes;
  }

  const exportNodes = new Map<string, ts.Node>();
  for (const statement of sourceFile.statements) {
    if (
      ts.isFunctionDeclaration(statement) &&
      statement.name?.text &&
      hasExportModifier(statement)
    ) {
      exportNodes.set(statement.name.text, statement);
      continue;
    }

    if (ts.isVariableStatement(statement) && hasExportModifier(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) {
          exportNodes.set(declaration.name.text, declaration);
        }
      }
    }
  }

  exportNodeCache.set(sourceFile, exportNodes);
  return exportNodes;
}

function getOrCreateInferredResponseCache(
  sourceFile: ts.SourceFile,
): Map<string, InferredRouteResponses> {
  let cachedResponses = inferredResponseCache.get(sourceFile);
  if (!cachedResponses) {
    cachedResponses = new Map<string, InferredRouteResponses>();
    inferredResponseCache.set(sourceFile, cachedResponses);
  }

  return cachedResponses;
}

function inferResponsesForSourceFile(
  sourceFile: ts.SourceFile,
  exportNodeMap: Map<string, ts.Node>,
  exportNames: readonly string[],
  checker: ts.TypeChecker,
): Map<string, InferredRouteResponses> {
  const inferredResponses = new Map<string, InferredRouteResponses>();

  exportNames.forEach((exportName) => {
    const exportNode = exportNodeMap.get(exportName);
    if (!exportNode) {
      return;
    }

    const result = inferResponsesForExportNode(sourceFile, exportNode, checker);
    inferredResponses.set(exportName, result);
  });

  return inferredResponses;
}

function inferResponsesForExportNode(
  sourceFile: ts.SourceFile,
  exportNode: ts.Node,
  checker: ts.TypeChecker,
): InferredRouteResponses {
  const diagnostics: Diagnostic[] = [];
  const responses = inferResponsesFromReturns(exportNode, sourceFile, checker, diagnostics);
  if (responses.length > 0) {
    return { responses, diagnostics };
  }

  const signatureResponse = inferResponseFromSignature(exportNode, checker);
  return {
    responses: signatureResponse ? [signatureResponse] : [],
    diagnostics,
  };
}

function hasExportModifier(node: ts.Node): boolean {
  if (!ts.canHaveModifiers(node)) {
    return false;
  }

  return Boolean(
    ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword),
  );
}

function inferResponsesFromReturns(
  exportNode: ts.Node,
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker,
  diagnostics: Diagnostic[],
): InferredResponseDefinition[] {
  const functionLike = getFunctionLikeNode(exportNode);
  if (!functionLike?.body) {
    return [];
  }

  const responses: InferredResponseDefinition[] = [];
  visitReturns(functionLike.body, (expression) => {
    const inferredResponse = inferResponseFromExpression(expression, sourceFile, checker);
    if (inferredResponse) {
      responses.push(inferredResponse);
      return;
    }

    diagnostics.push({
      code: "response-inference-unresolved",
      severity: "warning",
      message:
        "Could not fully infer a response schema from a return statement. Add an explicit @response tag to make the output deterministic.",
      filePath: sourceFile.fileName,
    });
  });

  return dedupeResponses(responses);
}

function inferResponseFromExpression(
  expression: ts.Expression,
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker,
): InferredResponseDefinition | undefined {
  if (ts.isCallExpression(expression)) {
    const calleeText = expression.expression.getText(sourceFile);
    if (calleeText === "NextResponse.json" || calleeText === "Response.json") {
      const responseType = extractNamedResponseType(checker.getTypeAtLocation(expression), checker);
      const type = expression.arguments[0]
        ? checker.getTypeAtLocation(expression.arguments[0])
        : undefined;
      const candidate = responseType
        ? { typeName: responseType }
        : type
          ? toSchemaCandidate(type, checker)
          : {};
      return {
        ...candidate,
        statusCode: getStatusCodeFromInit(expression.arguments[1]) || "200",
        contentType: "application/json",
        source: "typescript",
      };
    }

    if (calleeText === "NextResponse.redirect" || calleeText === "Response.redirect") {
      return {
        statusCode: getStatusCodeFromRedirectCall(expression) || "302",
        source: "typescript",
      };
    }
  }

  if (
    ts.isNewExpression(expression) &&
    expression.expression.getText(sourceFile) === "Response" &&
    getStatusCodeFromInit(expression.arguments?.[1]) === "204"
  ) {
    return {
      statusCode: "204",
      source: "typescript",
    };
  }

  return undefined;
}

function inferResponseFromSignature(
  exportNode: ts.Node,
  checker: ts.TypeChecker,
): InferredResponseDefinition | undefined {
  const signatureNode = getFunctionLikeNode(exportNode);
  if (!signatureNode) {
    return undefined;
  }

  const signature = checker.getSignatureFromDeclaration(signatureNode);
  if (!signature) {
    return undefined;
  }

  let returnType = checker.getReturnTypeOfSignature(signature);
  returnType = unwrapPromiseType(returnType, checker);
  const typeName = extractNamedResponseType(returnType, checker);
  if (!typeName) {
    return undefined;
  }

  return {
    typeName,
    source: "typescript",
  };
}

function getFunctionLikeNode(node: ts.Node): ts.FunctionLikeDeclaration | undefined {
  if (ts.isFunctionDeclaration(node)) {
    return node;
  }

  if (
    ts.isVariableDeclaration(node) &&
    node.initializer &&
    (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
  ) {
    return node.initializer;
  }

  return undefined;
}

function visitReturns(node: ts.Node, visitor: (expression: ts.Expression) => void): void {
  ts.forEachChild(node, (child) => {
    if (ts.isReturnStatement(child) && child.expression) {
      visitor(child.expression);
      return;
    }

    if (
      ts.isFunctionDeclaration(child) ||
      ts.isArrowFunction(child) ||
      ts.isFunctionExpression(child) ||
      ts.isMethodDeclaration(child)
    ) {
      return;
    }

    visitReturns(child, visitor);
  });
}

function getStatusCodeFromInit(node: ts.Node | undefined): string | undefined {
  if (!node || !ts.isObjectLiteralExpression(node)) {
    return undefined;
  }

  for (const property of node.properties) {
    if (
      ts.isPropertyAssignment(property) &&
      ts.isIdentifier(property.name) &&
      property.name.text === "status" &&
      ts.isNumericLiteral(property.initializer)
    ) {
      return property.initializer.text;
    }
  }

  return undefined;
}

function getStatusCodeFromRedirectCall(expression: ts.CallExpression): string | undefined {
  const statusArgument = expression.arguments[1];
  if (statusArgument && ts.isNumericLiteral(statusArgument)) {
    return statusArgument.text;
  }

  if (!statusArgument || !ts.isObjectLiteralExpression(statusArgument)) {
    return undefined;
  }

  return getStatusCodeFromInit(statusArgument);
}

function toSchemaCandidate(
  type: ts.Type,
  checker: ts.TypeChecker,
): Pick<InferredResponseDefinition, "typeName" | "schema"> {
  const typeName = extractNamedType(type, checker);
  if (typeName) {
    return { typeName };
  }

  return { schema: typeToOpenApiSchema(type, checker, new Set<string>()) };
}

function extractNamedResponseType(type: ts.Type, checker: ts.TypeChecker): string | undefined {
  const typeArguments = checker.getTypeArguments(type as ts.TypeReference);
  const firstTypeArgument = typeArguments[0];
  if (firstTypeArgument) {
    return extractNamedType(firstTypeArgument, checker);
  }

  return undefined;
}

function extractNamedType(type: ts.Type, checker: ts.TypeChecker): string | undefined {
  if (checker.isArrayType(type) || checker.isTupleType(type)) {
    const elementType = checker.getTypeArguments(type as ts.TypeReference)[0];
    const elementName = elementType ? extractNamedType(elementType, checker) : undefined;
    return elementName ? `${elementName}[]` : undefined;
  }

  const aliasName = type.aliasSymbol?.getName();
  if (aliasName && aliasName !== "__type" && !isIgnoredRuntimeType(aliasName)) {
    return aliasName;
  }

  const symbolName = type.getSymbol()?.getName();
  if (
    symbolName &&
    symbolName !== "__type" &&
    !symbolName.startsWith("__object") &&
    !isIgnoredRuntimeType(symbolName)
  ) {
    return symbolName;
  }

  return undefined;
}

function typeToOpenApiSchema(
  type: ts.Type,
  checker: ts.TypeChecker,
  seen: Set<string>,
): OpenApiSchemaLike {
  const seenKey = checker.typeToString(type);
  if (seen.has(seenKey)) {
    return { type: "object" };
  }

  seen.add(seenKey);

  if (type.isStringLiteral()) {
    return { type: "string", enum: [type.value] };
  }
  if (type.isNumberLiteral()) {
    return { type: "number", enum: [type.value] };
  }
  if (type.flags & ts.TypeFlags.BooleanLiteral) {
    return {
      type: "boolean",
      enum: [checker.typeToString(type) === "true"],
    };
  }
  if (type.flags & ts.TypeFlags.TemplateLiteral) {
    return { type: "string" };
  }
  if (type.flags & ts.TypeFlags.StringLike) {
    return { type: "string" };
  }
  if (type.flags & ts.TypeFlags.NumberLike) {
    return { type: "number" };
  }
  if (type.flags & ts.TypeFlags.BooleanLike) {
    return { type: "boolean" };
  }
  if (type.flags & ts.TypeFlags.Null) {
    return { type: "null" };
  }

  if (type.isUnion()) {
    const nullable = type.types.some((member) => member.flags & ts.TypeFlags.Null);
    const nonNullTypes = type.types.filter((member) => !(member.flags & ts.TypeFlags.Null));
    const soleNonNullType = nonNullTypes[0];
    if (nullable && soleNonNullType && nonNullTypes.length === 1) {
      return {
        ...typeToOpenApiSchema(soleNonNullType, checker, seen),
        nullable: true,
      };
    }

    return {
      oneOf: nonNullTypes.map((member) => typeToOpenApiSchema(member, checker, seen)),
    };
  }

  if (checker.isTupleType(type)) {
    const itemTypes = checker.getTypeArguments(type as ts.TypeReference);
    return {
      type: "array",
      prefixItems: itemTypes.map((itemType) => typeToOpenApiSchema(itemType, checker, seen)),
      items: false,
      minItems: itemTypes.length,
      maxItems: itemTypes.length,
    };
  }

  if (checker.isArrayType(type)) {
    const elementType = checker.getTypeArguments(type as ts.TypeReference)[0];
    return {
      type: "array",
      items: elementType ? typeToOpenApiSchema(elementType, checker, seen) : { type: "object" },
    };
  }

  const properties = checker.getPropertiesOfType(type);
  if (properties.length > 0) {
    const schemaProperties: Record<string, OpenApiSchemaLike> = {};
    const required: string[] = [];

    properties.forEach((property) => {
      const propertyDeclaration = property.valueDeclaration || property.declarations?.[0];
      if (!propertyDeclaration) {
        return;
      }

      const propertyType = checker.getTypeOfSymbolAtLocation(property, propertyDeclaration);
      schemaProperties[property.getName()] = typeToOpenApiSchema(propertyType, checker, seen);
      if (!(property.flags & ts.SymbolFlags.Optional)) {
        required.push(property.getName());
      }
    });

    return required.length > 0
      ? {
          type: "object",
          properties: schemaProperties,
          required,
        }
      : {
          type: "object",
          properties: schemaProperties,
        };
  }

  const stringIndexType = type.getStringIndexType();
  if (stringIndexType) {
    return {
      type: "object",
      additionalProperties: typeToOpenApiSchema(stringIndexType, checker, seen),
    };
  }

  return { type: "object" };
}

function unwrapPromiseType(type: ts.Type, checker: ts.TypeChecker): ts.Type {
  const symbolName = type.getSymbol()?.getName();
  if (symbolName === "Promise") {
    const typeArguments = checker.getTypeArguments(type as ts.TypeReference);
    if (typeArguments[0]) {
      return typeArguments[0];
    }
  }

  return type;
}

function dedupeResponses(responses: InferredResponseDefinition[]): InferredResponseDefinition[] {
  const seenKeys = new Set<string>();
  return responses.filter((response) => {
    const key = [
      response.statusCode || "",
      response.typeName || "",
      response.itemTypeName || "",
      response.contentType || "",
      response.schema ? JSON.stringify(response.schema) : "",
    ].join("|");

    if (seenKeys.has(key)) {
      return false;
    }

    seenKeys.add(key);
    return true;
  });
}

function isIgnoredRuntimeType(typeName: string): boolean {
  return typeName === "Promise" || typeName === "Response" || typeName === "NextResponse";
}
