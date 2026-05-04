import * as t from "@babel/types";

import type {
  ContentType,
  OpenAPIDefinition,
  OpenApiMediaTypeDefinition,
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

function parsePropertyComment(
  commentValue: string,
): Omit<PropertyOptions, "required" | "nullable"> {
  // Normalize JSDoc block: strip leading `*` from each line, then collapse to a single line.
  const text = commentValue
    .split("\n")
    .map((line) => line.replace(/^\s*\*\s?/, "").trim())
    .filter((line) => line.length > 0)
    .join(" ")
    .trim();

  const result: Omit<PropertyOptions, "required" | "nullable"> = {};
  let remaining = text;

  const formatMatch = remaining.match(/@format\s+(\S+)/);
  if (formatMatch?.[1]) {
    result.format = formatMatch[1];
    remaining = remaining.replace(formatMatch[0], "").trim();
  }

  // @example value — capture until next @tag or end of string
  const exampleMatch = remaining.match(/@example\s+(.+?)(?=\s*@\w|$)/);
  if (exampleMatch?.[1]) {
    const raw = exampleMatch[1].trim();
    try {
      result.example = JSON.parse(raw);
    } catch {
      result.example = raw;
    }
    remaining = remaining.replace(exampleMatch[0], "").trim();
  }

  // Strip any remaining unrecognised @tags
  remaining = remaining.replace(/@\w+(?:\s+\S+)*/g, "").trim();

  if (remaining) {
    result.description = remaining;
  }

  return result;
}

export function getPropertyOptions(node: any, contentType: ContentType): PropertyOptions {
  const isOptional = !!node.optional;
  const options: PropertyOptions = {};

  // Prefer leading JSDoc-style comments (`/** ... */` or `// ...` above the property);
  // fall back to a trailing inline comment (`prop: T; // ...`) when no leading comment
  // is attached. Leading takes precedence so canonical JSDoc wins, while trailing-only
  // codebases continue to work without migration.
  const leadingComment = node.leadingComments?.[node.leadingComments.length - 1];
  const trailingComment = node.trailingComments?.[0];
  const sourceComment = leadingComment ?? trailingComment;
  if (sourceComment) {
    Object.assign(options, parsePropertyComment(sourceComment.value));
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

export function createMultipartEncoding(
  body: OpenAPIDefinition | undefined,
): OpenApiMediaTypeDefinition["encoding"] | undefined {
  if (!body?.properties) {
    return undefined;
  }

  const encoding = Object.fromEntries(
    Object.entries(body.properties)
      .map(([name, value]) => {
        const contentType = getMultipartPartContentType(name, value);
        return contentType ? [name, { contentType }] : null;
      })
      .filter((entry): entry is [string, { contentType: string }] => entry !== null),
  );

  return Object.keys(encoding).length > 0 ? encoding : undefined;
}

function getMultipartPartContentType(
  propertyName: string,
  value: OpenAPIDefinition,
): string | undefined {
  if (typeof value.contentMediaType === "string") {
    return value.contentMediaType;
  }

  if (value.type === "string" && value.format === "binary") {
    return "application/octet-stream";
  }

  if (
    value.type === "object" &&
    (propertyName.toLowerCase().includes("file") ||
      value.description?.toLowerCase().includes("file"))
  ) {
    return "application/octet-stream";
  }

  return undefined;
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
