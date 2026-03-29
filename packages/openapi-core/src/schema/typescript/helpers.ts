import * as t from "@babel/types";

import type {
  ContentType,
  OpenAPIDefinition,
  PropertyOptions,
  SchemaType,
} from "../../shared/types.js";

export function normalizeSchemaTypes(schemaType: SchemaType | SchemaType[]): SchemaType[] {
  return Array.isArray(schemaType) ? schemaType : [schemaType];
}

export function normalizeSchemaDirs(schemaDir: string | string[]): string[] {
  return Array.isArray(schemaDir) ? schemaDir : [schemaDir];
}

export function getSchemaProcessorErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function splitGenericTypeArguments(typeArgsString: string): string[] {
  const args: string[] = [];
  let currentArg = "";
  let bracketDepth = 0;

  for (let i = 0; i < typeArgsString.length; i++) {
    const char = typeArgsString[i];

    if (char === "<") {
      bracketDepth++;
    } else if (char === ">") {
      bracketDepth--;
    } else if (char === "," && bracketDepth === 0) {
      args.push(currentArg.trim());
      currentArg = "";
      continue;
    }

    currentArg += char;
  }

  if (currentArg.trim()) {
    args.push(currentArg.trim());
  }

  return args;
}

export function parseGenericTypeString(
  genericTypeString: string,
): { baseTypeName: string; typeArguments: string[] } | null {
  const match = genericTypeString.match(/^([^<]+)<(.+)>$/);
  if (!match) {
    return null;
  }

  const baseTypeName = match[1]?.trim() || "";
  const typeArgsString = match[2]?.trim() || "";

  return {
    baseTypeName,
    typeArguments: splitGenericTypeArguments(typeArgsString),
  };
}

export function createTypeReferenceFromString(typeString: string): any {
  if (!typeString.includes("<")) {
    return {
      type: "TSTypeReference",
      typeName: {
        type: "Identifier",
        name: typeString,
      },
    };
  }

  const parsed = parseGenericTypeString(typeString);
  if (!parsed) {
    return {
      type: "TSTypeReference",
      typeName: {
        type: "Identifier",
        name: typeString,
      },
    };
  }

  return {
    type: "TSTypeReference",
    typeName: {
      type: "Identifier",
      name: parsed.baseTypeName,
    },
    typeParameters: {
      type: "TSTypeParameterInstantiation",
      params: parsed.typeArguments.map((arg) => createTypeReferenceFromString(arg)),
    },
  };
}

export function extractKeysFromLiteralType(node: any): string[] {
  if (t.isTSLiteralType(node) && t.isStringLiteral(node.literal)) {
    return [node.literal.value];
  }

  if (t.isTSUnionType(node)) {
    const keys: string[] = [];
    node.types.forEach((type: any) => {
      if (t.isTSLiteralType(type) && t.isStringLiteral(type.literal)) {
        keys.push(type.literal.value);
      }
    });
    return keys;
  }

  return [];
}

export function getPropertyOptions(node: any, contentType: ContentType): PropertyOptions {
  const isOptional = !!node.optional;

  let description = null;
  if (node.trailingComments && node.trailingComments.length) {
    description = node.trailingComments[0].value.trim();
  }

  const options: PropertyOptions = {};

  if (description) {
    options.description = description;
  }

  if (contentType === "body") {
    options.nullable = isOptional;
  }

  return options;
}

export function getExampleForParam(paramName: string, type: string = "string"): any {
  if (paramName === "id" || paramName.endsWith("Id") || paramName.endsWith("_id")) {
    return type === "string" ? "123" : 123;
  }

  switch (paramName.toLowerCase()) {
    case "slug":
      return "slug";
    case "uuid":
      return "123e4567-e89b-12d3-a456-426614174000";
    case "username":
      return "johndoe";
    case "email":
      return "user@example.com";
    case "name":
      return "name";
    case "date":
      return "2023-01-01";
    case "page":
      return 1;
    case "role":
      return "admin";
    default:
      if (type === "string") return "example";
      if (type === "number") return 1;
      if (type === "boolean") return true;
      return "example";
  }
}

export function detectContentType(bodyType: string, explicitContentType?: string): string {
  if (explicitContentType) {
    return explicitContentType;
  }

  if (
    bodyType &&
    (bodyType.toLowerCase().includes("formdata") ||
      bodyType.toLowerCase().includes("fileupload") ||
      bodyType.toLowerCase().includes("multipart"))
  ) {
    return "multipart/form-data";
  }

  return "application/json";
}

export function createFormDataSchema(body: OpenAPIDefinition): OpenAPIDefinition {
  if (!body.properties) {
    return body;
  }

  const formDataProperties: Record<string, any> = {};

  Object.entries(body.properties).forEach(([key, value]: [string, any]) => {
    if (
      value.type === "object" &&
      (key.toLowerCase().includes("file") || value.description?.toLowerCase().includes("file"))
    ) {
      formDataProperties[key] = {
        type: "string",
        format: "binary",
        description: value.description,
      };
    } else {
      formDataProperties[key] = value;
    }
  });

  return {
    ...body,
    properties: formDataProperties,
  };
}

export function isDateString(node: any): boolean {
  if (t.isStringLiteral(node)) {
    const dateRegex = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z)?$/;
    return dateRegex.test(node.value);
  }
  return false;
}

export function isDateObject(node: any): boolean {
  return t.isNewExpression(node) && t.isIdentifier(node.callee, { name: "Date" });
}

export function isDateNode(node: any): boolean {
  return isDateString(node) || isDateObject(node);
}
