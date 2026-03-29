import * as t from "@babel/types";

export function extractFunctionReturnType(funcNode: any): any | null {
  if (t.isFunctionDeclaration(funcNode) || t.isFunctionExpression(funcNode)) {
    return funcNode.returnType && t.isTSTypeAnnotation(funcNode.returnType)
      ? funcNode.returnType.typeAnnotation
      : null;
  }

  if (t.isArrowFunctionExpression(funcNode)) {
    return funcNode.returnType && t.isTSTypeAnnotation(funcNode.returnType)
      ? funcNode.returnType.typeAnnotation
      : null;
  }

  if (t.isVariableDeclarator(funcNode) && t.isArrowFunctionExpression(funcNode.init)) {
    return funcNode.init.returnType && t.isTSTypeAnnotation(funcNode.init.returnType)
      ? funcNode.init.returnType.typeAnnotation
      : null;
  }

  return null;
}

export function extractFunctionParameters(funcNode: any): any[] {
  if (t.isFunctionDeclaration(funcNode) || t.isFunctionExpression(funcNode)) {
    return funcNode.params || [];
  }

  if (t.isArrowFunctionExpression(funcNode)) {
    return funcNode.params || [];
  }

  if (t.isVariableDeclarator(funcNode) && t.isArrowFunctionExpression(funcNode.init)) {
    return funcNode.init.params || [];
  }

  return [];
}
