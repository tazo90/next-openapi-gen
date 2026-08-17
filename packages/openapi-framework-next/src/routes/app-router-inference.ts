import * as t from "@babel/types";

import { collectHandlerInsights } from "@workspace/openapi-core/frameworks/shared/handler-insights.js";
import type { DataTypes } from "@workspace/openapi-core/shared/types.js";

export type AnalyzedHandler =
  | { kind: "direct"; dataTypes: DataTypes }
  | {
      kind: "needs-checker";
      dataTypes: DataTypes;
      inferredQueryParamNames: string[];
      inferredResponseType: string;
    };

export function analyzeHandler(dataTypes: DataTypes, handlerNode: t.Node): AnalyzedHandler {
  const handlerInsights = collectHandlerInsights(handlerNode, {
    hasPathParams: Boolean(dataTypes.pathParamsType?.trim()),
  });
  const {
    inferredBodyType,
    inferredPathParamsType,
    inferredQueryParamNames,
    inferredQueryParamsType,
    inferredResponses,
    handlerDiagnostics,
    requiresTypeScriptChecker,
  } = handlerInsights;
  const inferredDataTypes: DataTypes = {
    ...dataTypes,
    ...(inferredBodyType && !dataTypes.bodyType ? { inferredBodyType } : {}),
    ...(inferredPathParamsType && !dataTypes.pathParamsType ? { inferredPathParamsType } : {}),
    ...(inferredQueryParamsType && !dataTypes.paramsType ? { inferredQueryParamsType } : {}),
    ...(inferredQueryParamNames.length > 0 ? { inferredQueryParamNames } : {}),
    ...(handlerDiagnostics.length > 0
      ? { diagnostics: [...(dataTypes.diagnostics ?? []), ...handlerDiagnostics] }
      : {}),
  };
  if (dataTypes.responseType || dataTypes.responseItemType || dataTypes.successCode === "204") {
    return {
      kind: "direct",
      dataTypes: inferredDataTypes,
    };
  }

  const inferredResponseType = inferResponseTypeFromHandler(handlerNode);
  if (inferredResponseType && !requiresTypeScriptChecker) {
    return {
      kind: "direct",
      dataTypes: {
        ...inferredDataTypes,
        responseType: inferredResponseType,
      },
    };
  }

  if (!requiresTypeScriptChecker && !inferredResponseType) {
    return {
      kind: "direct",
      dataTypes: {
        ...inferredDataTypes,
        ...(inferredResponses.length > 0 ? { inferredResponses } : {}),
      },
    };
  }

  return {
    kind: "needs-checker",
    dataTypes: inferredDataTypes,
    inferredQueryParamNames,
    inferredResponseType,
  };
}

export function inferResponseTypeFromHandler(handlerNode: t.Node): string {
  const functionLike = getFunctionLikeNode(handlerNode);
  if (
    functionLike &&
    (t.isFunctionDeclaration(functionLike) || t.isFunctionExpression(functionLike))
  ) {
    return inferResponseTypeFromAnnotation(getReturnTypeAnnotation(functionLike.returnType));
  }

  if (functionLike && t.isArrowFunctionExpression(functionLike)) {
    return inferResponseTypeFromAnnotation(getReturnTypeAnnotation(functionLike.returnType));
  }

  return "";
}

export function getFunctionLikeNode(
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

export function getReturnTypeAnnotation(
  returnType: t.Noop | t.TSTypeAnnotation | t.TypeAnnotation | null | undefined,
): t.TSType | null | undefined {
  if (returnType && t.isTSTypeAnnotation(returnType)) {
    return returnType.typeAnnotation;
  }

  return undefined;
}

export function inferResponseTypeFromAnnotation(typeNode: t.TSType | null | undefined): string {
  if (!typeNode) {
    return "";
  }

  if (t.isTSTypeReference(typeNode)) {
    const typeName = getTypeReferenceName(typeNode.typeName);
    const typeParams = typeNode.typeParameters?.params ?? [];

    if (typeName === "Promise" && typeParams[0]) {
      return inferResponseTypeFromAnnotation(typeParams[0]);
    }

    if (typeName === "NextResponse" && typeParams[0]) {
      return stringifyTypeNode(typeParams[0]);
    }
  }

  return "";
}

export function getTypeReferenceName(typeName: t.TSEntityName): string {
  if (t.isIdentifier(typeName)) {
    return typeName.name;
  }

  return typeName.right.name;
}

export function stringifyTypeNode(typeNode: t.TSType): string {
  if (t.isTSTypeReference(typeNode)) {
    const typeName = getTypeReferenceName(typeNode.typeName);
    const typeParams = typeNode.typeParameters?.params ?? [];
    if (typeParams.length === 0) {
      return typeName;
    }

    return `${typeName}<${typeParams.map((param) => stringifyTypeNode(param)).join(", ")}>`;
  }

  if (t.isTSArrayType(typeNode)) {
    return `${stringifyTypeNode(typeNode.elementType)}[]`;
  }

  return "";
}
