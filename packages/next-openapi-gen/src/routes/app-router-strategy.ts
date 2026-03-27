import * as t from "@babel/types";
import fs from "fs";
import type { NodePath } from "@babel/traverse";

import { HTTP_METHODS } from "./router-strategy.js";
import { traverse } from "../shared/babel-traverse.js";
import type { RouterStrategy } from "./router-strategy.js";
import { extractJSDocComments, parseTypeScriptFile } from "../shared/utils.js";
import type { DataTypes, OpenApiConfig } from "../shared/types.js";

export class AppRouterStrategy implements RouterStrategy {
  private config: OpenApiConfig;

  constructor(config: OpenApiConfig) {
    this.config = config;
  }

  shouldProcessFile(fileName: string): boolean {
    return fileName === "route.ts" || fileName === "route.tsx";
  }

  processFile(
    filePath: string,
    addRoute: (method: string, filePath: string, dataTypes: DataTypes) => void,
  ): void {
    const content = fs.readFileSync(filePath, "utf-8");
    const ast = parseTypeScriptFile(content);

    traverse(ast, {
      ExportNamedDeclaration: (path: NodePath<t.ExportNamedDeclaration>) => {
        const declaration = path.node.declaration;

        if (t.isFunctionDeclaration(declaration) && t.isIdentifier(declaration.id)) {
          if (HTTP_METHODS.includes(declaration.id.name)) {
            const dataTypes = this.inferHandlerDataTypes(extractJSDocComments(path), declaration);
            addRoute(declaration.id.name, filePath, dataTypes);
          }
        }

        if (t.isVariableDeclaration(declaration)) {
          declaration.declarations.forEach((decl) => {
            if (t.isVariableDeclarator(decl) && t.isIdentifier(decl.id)) {
              if (HTTP_METHODS.includes(decl.id.name)) {
                const dataTypes = this.inferHandlerDataTypes(extractJSDocComments(path), decl);
                addRoute(decl.id.name, filePath, dataTypes);
              }
            }
          });
        }
      },
    });
  }

  getRoutePath(filePath: string): string {
    const normalizedPath = filePath.replaceAll("\\", "/");

    const normalizedApiDir = this.config.apiDir
      .replaceAll("\\", "/")
      .replace(/^\.\//, "")
      .replace(/\/$/, "");

    const apiDirIndex = normalizedPath.indexOf(normalizedApiDir);

    if (apiDirIndex === -1) {
      throw new Error(`Could not find apiDir "${this.config.apiDir}" in file path "${filePath}"`);
    }

    let relativePath = normalizedPath.substring(apiDirIndex + normalizedApiDir.length);

    // Remove the /route.ts or /route.tsx suffix
    relativePath = relativePath.replace(/\/route\.tsx?$/, "");

    if (!relativePath.startsWith("/")) {
      relativePath = "/" + relativePath;
    }

    relativePath = relativePath.replace(/\/$/, "");

    // Remove Next.js route groups (folders in parentheses like (authenticated))
    relativePath = relativePath.replace(/\/\([^)]+\)/g, "");

    // Handle catch-all routes before dynamic routes
    relativePath = relativePath.replace(/\/\[\.\.\.(.*?)\]/g, "/{$1}");

    // Convert Next.js dynamic route syntax to OpenAPI parameter syntax
    relativePath = relativePath.replace(/\/\[([^\]]+)\]/g, "/{$1}");

    return relativePath || "/";
  }

  private inferHandlerDataTypes(dataTypes: DataTypes, handlerNode: t.Node): DataTypes {
    if (dataTypes.responseType) {
      return dataTypes;
    }

    const inferredResponseType = this.inferResponseTypeFromHandler(handlerNode);
    if (!inferredResponseType) {
      return dataTypes;
    }

    return {
      ...dataTypes,
      responseType: inferredResponseType,
    };
  }

  private inferResponseTypeFromHandler(handlerNode: t.Node): string {
    if (t.isFunctionDeclaration(handlerNode) || t.isFunctionExpression(handlerNode)) {
      return this.inferResponseTypeFromAnnotation(handlerNode.returnType?.typeAnnotation);
    }

    if (t.isVariableDeclarator(handlerNode) && t.isArrowFunctionExpression(handlerNode.init)) {
      return this.inferResponseTypeFromAnnotation(handlerNode.init.returnType?.typeAnnotation);
    }

    return "";
  }

  private inferResponseTypeFromAnnotation(typeNode: t.TSType | null | undefined): string {
    if (!typeNode) {
      return "";
    }

    if (t.isTSTypeReference(typeNode)) {
      const typeName = this.getTypeReferenceName(typeNode.typeName);
      const typeParams = typeNode.typeParameters?.params ?? [];

      if (typeName === "Promise" && typeParams[0]) {
        return this.inferResponseTypeFromAnnotation(typeParams[0]);
      }

      if (typeName === "NextResponse" && typeParams[0]) {
        return this.stringifyTypeNode(typeParams[0]);
      }
    }

    return "";
  }

  private getTypeReferenceName(typeName: t.TSEntityName): string {
    if (t.isIdentifier(typeName)) {
      return typeName.name;
    }

    return typeName.right.name;
  }

  private stringifyTypeNode(typeNode: t.TSType): string {
    if (t.isTSTypeReference(typeNode)) {
      const typeName = this.getTypeReferenceName(typeNode.typeName);
      const typeParams = typeNode.typeParameters?.params ?? [];
      if (typeParams.length === 0) {
        return typeName;
      }

      return `${typeName}<${typeParams.map((param) => this.stringifyTypeNode(param)).join(", ")}>`;
    }

    if (t.isTSArrayType(typeNode)) {
      return `${this.stringifyTypeNode(typeNode.elementType)}[]`;
    }

    return "";
  }
}
