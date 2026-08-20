import * as t from "@babel/types";

import { logger } from "../../shared/logger.js";
import type { ContentType, OpenAPIDefinition } from "../../shared/types.js";
import {
  createTypeReferenceFromString,
  getPropertyOptions,
  parseGenericTypeString,
} from "./helpers.js";

export type GenericTypeHost = {
  contentType: ContentType;
  findSchemaDefinition: (schemaName: string, contentType: ContentType) => OpenAPIDefinition;
  isGenericTypeParameter: (typeName: string) => boolean;
  openapiDefinitions: Record<string, OpenAPIDefinition>;
  resolveGenericType: (
    genericTypeDefinition: any,
    typeArguments: any[],
    typeName: string,
  ) => OpenAPIDefinition;
  resolveTSNodeType: (node: any) => OpenAPIDefinition;
  scanAllSchemaDirs: (schemaName: string) => void;
  typeDefinitions: Record<string, any>;
};

export function resolveGenericTypeFromString(
  host: GenericTypeHost,
  genericTypeString: string,
): OpenAPIDefinition {
  // Parse the generic type string
  const parsed = parseGenericTypeString(genericTypeString);
  if (!parsed) {
    return {};
  }

  const { baseTypeName, typeArguments } = parsed;

  // Find the base generic type definition
  host.scanAllSchemaDirs(baseTypeName);
  const genericDefEntry = host.typeDefinitions[baseTypeName];
  const genericTypeDefinition = genericDefEntry?.node || genericDefEntry;

  if (!genericTypeDefinition) {
    logger.debug(`Generic type definition not found for: ${baseTypeName}`);
    return {};
  }

  // Also find all the type argument definitions
  typeArguments.forEach((argTypeName: string) => {
    // If it's a simple type reference (not another generic), find its definition
    if (!argTypeName.includes("<") && !host.isGenericTypeParameter(argTypeName)) {
      host.scanAllSchemaDirs(argTypeName);
    }
  });

  // Create AST nodes for the type arguments by parsing them
  const typeArgumentNodes = typeArguments.map((arg: string) => createTypeReferenceFromString(arg));

  // Resolve the generic type
  const resolved = host.resolveGenericType(genericTypeDefinition, typeArgumentNodes, baseTypeName);

  // Cache the resolved type for future reference
  host.openapiDefinitions[genericTypeString] = resolved;

  return resolved;
}

export function resolveGenericType(
  host: GenericTypeHost,
  genericTypeDefinition: any,
  typeArguments: any[],
  _typeName: string,
): OpenAPIDefinition {
  let typeParameters: string[] = [];
  let bodyToResolve: any = null;

  // Handle type alias declarations
  if (t.isTSTypeAliasDeclaration(genericTypeDefinition)) {
    if (genericTypeDefinition.typeParameters && genericTypeDefinition.typeParameters.params) {
      typeParameters = genericTypeDefinition.typeParameters.params.map((param: any) => {
        if (t.isTSTypeParameter(param)) {
          return param.name;
        }
        return t.isIdentifier(param) ? param.name : param.name?.name || param;
      });
    }
    bodyToResolve = genericTypeDefinition.typeAnnotation;
  }

  // Handle interface declarations
  if (t.isTSInterfaceDeclaration(genericTypeDefinition)) {
    if (genericTypeDefinition.typeParameters && genericTypeDefinition.typeParameters.params) {
      typeParameters = genericTypeDefinition.typeParameters.params.map((param: any) => {
        if (t.isTSTypeParameter(param)) {
          return param.name;
        }
        return t.isIdentifier(param) ? param.name : param.name?.name || param;
      });
    }
    bodyToResolve = genericTypeDefinition.body;
  }

  if (!bodyToResolve) {
    return {};
  }

  // Create a mapping from type parameters to actual types
  const typeParameterMap: Record<string, any> = {};
  typeParameters.forEach((param: string, index: number) => {
    if (index < typeArguments.length) {
      typeParameterMap[param] = typeArguments[index];
    }
  });

  // Resolve the type annotation with substituted type parameters
  return resolveTypeWithSubstitution(host, bodyToResolve, typeParameterMap);
}

export function resolveTypeWithSubstitution(
  host: GenericTypeHost,
  node: any,
  typeParameterMap: Record<string, any>,
): OpenAPIDefinition {
  if (!node) return { type: "object" };

  // If this is a type parameter reference, substitute it
  if (t.isTSTypeReference(node) && t.isIdentifier(node.typeName)) {
    const paramName = node.typeName.name;
    if (typeParameterMap[paramName]) {
      // The mapped value is an AST node, resolve it
      const mappedNode = typeParameterMap[paramName];
      if (t.isTSTypeReference(mappedNode) && t.isIdentifier(mappedNode.typeName)) {
        // If it's a reference to another type, get the resolved schema from openapiDefinitions
        const referencedTypeName = mappedNode.typeName.name;
        if (host.openapiDefinitions[referencedTypeName]) {
          return host.openapiDefinitions[referencedTypeName];
        }
        // If not in openapiDefinitions, try to resolve it
        host.findSchemaDefinition(referencedTypeName, host.contentType);
        return host.openapiDefinitions[referencedTypeName] || {};
      }
      return host.resolveTSNodeType(typeParameterMap[paramName]);
    }
  }

  if (t.isTSArrayType(node)) {
    return {
      type: "array",
      items: resolveTypeWithSubstitution(host, node.elementType, typeParameterMap),
    };
  }

  // Handle intersection types (e.g., T & { success: true })
  if (t.isTSIntersectionType(node)) {
    const allProperties: Record<string, any> = {};
    const requiredProperties: string[] = [];

    node.types.forEach((typeNode: any, _index: number) => {
      let resolvedType: OpenAPIDefinition;

      // Check if this is a type parameter reference
      if (t.isTSTypeReference(typeNode) && t.isIdentifier(typeNode.typeName)) {
        const paramName = typeNode.typeName.name;

        if (typeParameterMap[paramName]) {
          const mappedNode = typeParameterMap[paramName];
          if (t.isTSTypeReference(mappedNode) && t.isIdentifier(mappedNode.typeName)) {
            // If it's a reference to another type, get the resolved schema
            const referencedTypeName = mappedNode.typeName.name;

            if (host.openapiDefinitions[referencedTypeName]) {
              resolvedType = host.openapiDefinitions[referencedTypeName];
            } else {
              // If not in openapiDefinitions, try to resolve it
              host.findSchemaDefinition(referencedTypeName, host.contentType);
              resolvedType = host.openapiDefinitions[referencedTypeName] || {};
            }
          } else {
            resolvedType = host.resolveTSNodeType(mappedNode);
          }
        } else {
          resolvedType = host.resolveTSNodeType(typeNode);
        }
      } else {
        resolvedType = resolveTypeWithSubstitution(host, typeNode, typeParameterMap);
      }

      if (resolvedType.type === "object" && resolvedType.properties) {
        Object.entries(resolvedType.properties).forEach(([key, value]: [string, any]) => {
          allProperties[key] = value;
        });
        resolvedType.required?.forEach((key) => {
          if (!requiredProperties.includes(key)) {
            requiredProperties.push(key);
          }
        });
      }
    });

    return requiredProperties.length > 0
      ? {
          type: "object",
          properties: allProperties,
          required: requiredProperties,
        }
      : {
          type: "object",
          properties: allProperties,
        };
  }

  // For other types, use the standard resolution but with parameter substitution
  if (t.isTSTypeLiteral(node)) {
    const properties: Record<string, any> = {};
    const required: string[] = [];
    node.members.forEach((member: any) => {
      if (t.isTSPropertySignature(member) && t.isIdentifier(member.key)) {
        const propName = member.key.name;
        properties[propName] = {
          ...resolveTypeWithSubstitution(
            host,
            member.typeAnnotation?.typeAnnotation,
            typeParameterMap,
          ),
          ...getPropertyOptions(member, host.contentType),
        };
        if (!member.optional) {
          required.push(propName);
        }
      }
    });
    return required.length > 0
      ? { type: "object", properties, required }
      : { type: "object", properties };
  }

  // Handle interface body (from generic interfaces)
  if (t.isTSInterfaceBody(node)) {
    const properties: Record<string, any> = {};
    const required: string[] = [];
    node.body.forEach((member: any) => {
      if (t.isTSPropertySignature(member) && t.isIdentifier(member.key)) {
        const propName = member.key.name;
        properties[propName] = {
          ...resolveTypeWithSubstitution(
            host,
            member.typeAnnotation?.typeAnnotation,
            typeParameterMap,
          ),
          ...getPropertyOptions(member, host.contentType),
        };
        if (!member.optional) {
          required.push(propName);
        }
      }
    });
    return required.length > 0
      ? { type: "object", properties, required }
      : { type: "object", properties };
  }

  // Fallback to standard type resolution
  return host.resolveTSNodeType(node);
}
