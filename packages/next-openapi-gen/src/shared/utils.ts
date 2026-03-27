import type { NodePath } from "@babel/traverse";
import { parse } from "@babel/parser";
import type { ParserOptions } from "@babel/parser";
import * as t from "@babel/types";

import { resolveTypeScriptValueReference } from "./typescript-project.js";
import type {
  DataTypes,
  Diagnostic,
  JSDocExampleDefinition,
  JsonValue,
  OpenApiDocument,
  OpenApiExampleMap,
  ParamSchema,
} from "./types.js";

export function capitalize(string: string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

/**
 * Extract path parameters from a route path
 * e.g. /users/{id}/posts/{postId} -> ['id', 'postId']
 */
export function extractPathParameters(routePath: string): string[] {
  const paramRegex = /{([^}]+)}/g;
  const params: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = paramRegex.exec(routePath)) !== null) {
    if (match[1]) {
      params.push(match[1]);
    }
  }

  return params;
}

export function extractJSDocComments(path: NodePath, filePath?: string): DataTypes {
  const comments = path.node.leadingComments;
  const result = createEmptyDataTypes();

  if (comments) {
    comments.forEach((comment: t.Comment) => {
      mergeJSDocData(result, parseJSDocBlock(comment.value, filePath));
    });
  }

  return result;
}

export function parseJSDocBlock(commentValue: string, filePath?: string): DataTypes {
  const normalizedComment = cleanComment(commentValue);
  const result = createEmptyDataTypes();

  result.isOpenApi = normalizedComment.includes("@openapi");
  result.isIgnored = normalizedComment.includes("@ignore");
  result.deprecated = normalizedComment.includes("@deprecated");

  const firstLine = normalizedComment.split("\n")[0] ?? "";
  if (!firstLine.trim().startsWith("@")) {
    result.summary = firstLine.trim();
  }

  result.description = extractLineValue(normalizedComment, "@description");
  result.tag = extractLineValue(normalizedComment, "@tag");
  result.tagSummary = extractLineValue(normalizedComment, "@tagSummary");
  result.tagKind = extractLineValue(normalizedComment, "@tagKind");
  result.tagParent = extractLineValue(normalizedComment, "@tagParent");
  result.bodyDescription = extractLineValue(normalizedComment, "@bodyDescription");
  result.contentType = extractLineValue(normalizedComment, "@contentType");
  result.responseContentType = extractLineValue(normalizedComment, "@responseContentType");
  result.responseDescription = extractLineValue(normalizedComment, "@responseDescription");
  result.responseSet = extractLineValue(normalizedComment, "@responseSet");
  result.operationId = extractTokenValue(normalizedComment, "@operationId");
  result.method = extractTokenValue(normalizedComment, "@method").toUpperCase();
  result.responseItemType = extractTypeFromComment(normalizedComment, "@responseItem");
  result.paramsType =
    extractTypeFromComment(normalizedComment, "@queryParams") ||
    extractTypeFromComment(normalizedComment, "@params");
  result.pathParamsType = extractTypeFromComment(normalizedComment, "@pathParams");
  result.bodyType = extractTypeFromComment(normalizedComment, "@body");

  const authValue = extractLineValue(normalizedComment, "@auth");
  if (authValue) {
    result.auth = performAuthPresetReplacements(authValue);
  }

  const querystring = parseQuerystringTag(normalizedComment);
  if (querystring) {
    result.querystringType = querystring.typeName;
    result.querystringName = querystring.name;
  }

  const responseItemEncoding = extractJsonLineValue(normalizedComment, "@responseItemEncoding");
  if (typeof responseItemEncoding !== "undefined") {
    result.responseItemEncoding = responseItemEncoding;
  }

  const responsePrefixEncoding = extractJsonLineValue(normalizedComment, "@responsePrefixEncoding");
  if (Array.isArray(responsePrefixEncoding)) {
    result.responsePrefixEncoding = responsePrefixEncoding;
  }

  const parsedResponse = parseResponseTag(normalizedComment);
  if (parsedResponse) {
    result.successCode = parsedResponse.successCode;
    result.responseType = parsedResponse.responseType;
    if (!result.responseDescription && parsedResponse.responseDescription) {
      result.responseDescription = parsedResponse.responseDescription;
    }
  }

  const addMatches = [...normalizedComment.matchAll(/@add\s+([^\n\r@]*)/g)];
  if (addMatches.length > 0) {
    result.addResponses = addMatches
      .map((match) => match[1]?.trim() || "")
      .filter(Boolean)
      .join(",");
  }

  const examples = collectExampleDefinitions(normalizedComment, "@examples", filePath);
  result.requestExamples = buildExampleMap(examples.definitions, "request");
  result.responseExamples = buildExampleMap(examples.definitions, "response");
  result.querystringExamples = buildExampleMap(examples.definitions, "querystring");
  if (examples.diagnostics.length > 0) {
    result.diagnostics = examples.diagnostics;
  }

  return result;
}

export function extractTypeFromComment(commentValue: string, tag: string): string {
  // Updated regex to support generic types with angle brackets and array brackets
  // Use multiline mode (m flag) to match tag at start of line (after optional * from JSDoc)
  return (
    commentValue.match(new RegExp(`^\\s*\\*?\\s*${tag}\\s+([\\w<>,\\s[\\]]+)`, "m"))?.[1]?.trim() ||
    ""
  );
}

export function parseResponseTag(commentValue: string): {
  responseDescription: string;
  responseType: string;
  successCode: string;
} | null {
  const rawValue = commentValue.match(/@response\s+([^\n\r@]+)/)?.[1]?.trim();

  if (!rawValue) {
    return null;
  }

  if (/^\d{3}$/.test(rawValue)) {
    return {
      responseDescription: "",
      responseType: "",
      successCode: rawValue,
    };
  }

  const segments = rawValue.split(":").map((segment) => segment.trim());
  let successCode = "";
  let responseType = rawValue;
  let responseDescription = "";

  if (segments[0] && /^\d{3}$/.test(segments[0])) {
    successCode = segments.shift() || "";
  }

  if (segments.length > 0) {
    responseType = segments.shift() || "";
  }

  if (segments.length > 0) {
    responseDescription = segments.join(":").trim();
  }

  return {
    responseDescription,
    responseType,
    successCode,
  };
}

function createEmptyDataTypes(): DataTypes {
  return {
    tag: "",
    tagSummary: "",
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
    isOpenApi: false,
    isIgnored: false,
    deprecated: false,
    bodyDescription: "",
    contentType: "",
    responseType: "",
    responseContentType: "",
    responseItemType: "",
    responseDescription: "",
    responseSet: "",
    addResponses: "",
    successCode: "",
    operationId: "",
    method: "",
  };
}

function mergeJSDocData(target: DataTypes, source: DataTypes): void {
  for (const [key, value] of Object.entries(source) as Array<
    [keyof DataTypes, DataTypes[keyof DataTypes]]
  >) {
    if (typeof value === "undefined") {
      continue;
    }

    const existingValue = target[key];

    if (typeof value === "boolean") {
      target[key] = ((target[key] as boolean | undefined) || value) as never;
      continue;
    }

    if (Array.isArray(value)) {
      if (key === "diagnostics" && Array.isArray(existingValue)) {
        target[key] = [...existingValue, ...value] as never;
      } else {
        target[key] = value as never;
      }
      continue;
    }
    if (isExampleMap(existingValue) && isExampleMap(value)) {
      target[key] = {
        ...existingValue,
        ...value,
      } as never;
      continue;
    }

    if (typeof value === "string" && value.length === 0) {
      continue;
    }

    target[key] = value as never;
  }
}

export function cleanComment(commentValue: string): string {
  return commentValue.replace(/\*\s*/g, "").trim();
}

function extractLineValue(commentValue: string, tag: string): string {
  return commentValue.match(new RegExp(`${escapeRegExp(tag)}\\s*(.*)`, "m"))?.[1]?.trim() || "";
}

function extractTokenValue(commentValue: string, tag: string): string {
  return commentValue.match(new RegExp(`${escapeRegExp(tag)}\\s+(\\S+)`, "m"))?.[1]?.trim() || "";
}

function extractJsonLineValue(commentValue: string, tag: string): JsonValue | undefined {
  const rawValue = extractLineValue(commentValue, tag);
  if (!rawValue) {
    return undefined;
  }

  return parseJsonValue(rawValue);
}

function parseQuerystringTag(commentValue: string): { typeName: string; name: string } | null {
  const match = commentValue.match(/@querystring\s+([^\s]+)(?:\s+as\s+(\S+))?/m);
  if (!match?.[1]) {
    return null;
  }

  const typeName = match[1].trim();
  const name = match[2]?.trim() || toCamelCase(typeName.replaceAll(/<.*>/g, ""));
  return { typeName, name };
}

function collectExampleDefinitions(
  commentValue: string,
  tag: string,
  filePath?: string,
): { definitions: JSDocExampleDefinition[]; diagnostics: Diagnostic[] } {
  const matches = [
    ...commentValue.matchAll(new RegExp(`${escapeRegExp(tag)}\\s+([^\\n\\r@]+)`, "g")),
  ];
  return matches.reduce<{ definitions: JSDocExampleDefinition[]; diagnostics: Diagnostic[] }>(
    (result, match) => {
      const parsed = parseExampleDefinition(match[1]?.trim() || "", filePath);
      result.definitions.push(...parsed.definitions);
      result.diagnostics.push(...parsed.diagnostics);
      return result;
    },
    { definitions: [], diagnostics: [] },
  );
}

function parseExampleDefinition(
  rawValue: string,
  filePath?: string,
): { definitions: JSDocExampleDefinition[]; diagnostics: Diagnostic[] } {
  const firstColon = rawValue.indexOf(":");
  if (firstColon === -1) {
    return { definitions: [], diagnostics: [] };
  }

  const target = rawValue.slice(0, firstColon).trim();
  const rest = rawValue.slice(firstColon + 1).trim();
  if (!isExampleTarget(target) || !rest) {
    return { definitions: [], diagnostics: [] };
  }

  if (rest.startsWith("{") || rest.startsWith("[")) {
    return normalizeExampleSource(target, undefined, parseJsonValue(rest), filePath, {
      allowCollectionExpansion: true,
      fallbackName: "example",
    });
  }

  if (isExampleExternalValue(rest) || rest.startsWith("serialized:")) {
    return createSingleExampleDefinition(target, "example", rest);
  }

  const secondColon = rest.indexOf(":");
  if (secondColon === -1) {
    return resolveExampleReference(target, undefined, rest, filePath, true);
  }

  const name = rest.slice(0, secondColon).trim();
  const payload = rest.slice(secondColon + 1).trim();
  if (!name || !payload) {
    return { definitions: [], diagnostics: [] };
  }

  if (payload.startsWith("ref:")) {
    return resolveExampleReference(
      target,
      name,
      payload.slice("ref:".length).trim(),
      filePath,
      false,
    );
  }

  return createSingleExampleDefinition(target, name, payload);
}

function buildExampleMap(
  definitions: JSDocExampleDefinition[],
  target: JSDocExampleDefinition["target"],
): OpenApiExampleMap | undefined {
  const filteredDefinitions = definitions.filter((definition) => definition.target === target);
  if (filteredDefinitions.length === 0) {
    return undefined;
  }

  return Object.fromEntries(
    filteredDefinitions.map((definition) => [
      definition.name,
      {
        ...(definition.summary ? { summary: definition.summary } : {}),
        ...(definition.description ? { description: definition.description } : {}),
        ...(typeof definition.value !== "undefined" ? { value: definition.value } : {}),
        ...(definition.serializedValue ? { serializedValue: definition.serializedValue } : {}),
        ...(definition.externalValue ? { externalValue: definition.externalValue } : {}),
      },
    ]),
  );
}

function parseJsonValue(rawValue: string): JsonValue {
  try {
    return JSON.parse(rawValue) as JsonValue;
  } catch {
    return rawValue;
  }
}

function toCamelCase(value: string): string {
  const normalized = value.replaceAll(/[^A-Za-z0-9]+/g, " ").trim();
  if (!normalized) {
    return "query";
  }

  return normalized
    .split(/\s+/)
    .map((segment, index) => {
      const lower = segment.toLowerCase();
      return index === 0 ? lower : lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join("");
}

function isExampleTarget(value: string): value is JSDocExampleDefinition["target"] {
  return value === "request" || value === "response" || value === "querystring";
}

function normalizeExampleSource(
  target: JSDocExampleDefinition["target"],
  explicitName: string | undefined,
  source: unknown,
  filePath: string | undefined,
  options: {
    allowCollectionExpansion: boolean;
    fallbackName: string;
  },
): { definitions: JSDocExampleDefinition[]; diagnostics: Diagnostic[] } {
  if (!options.allowCollectionExpansion) {
    return coerceSingleExampleDefinition(
      target,
      explicitName || options.fallbackName,
      source,
      filePath,
    );
  }

  if (Array.isArray(source)) {
    return source.reduce<{ definitions: JSDocExampleDefinition[]; diagnostics: Diagnostic[] }>(
      (result, item, index) => {
        const next = coerceSingleExampleDefinition(
          target,
          explicitName || getGeneratedExampleName(options.fallbackName, index),
          item,
          filePath,
        );
        result.definitions.push(...next.definitions);
        result.diagnostics.push(...next.diagnostics);
        return result;
      },
      { definitions: [], diagnostics: [] },
    );
  }

  if (isExampleDescriptorMap(source)) {
    return Object.entries(source).reduce<{
      definitions: JSDocExampleDefinition[];
      diagnostics: Diagnostic[];
    }>(
      (result, [name, value]) => {
        const next = coerceSingleExampleDefinition(target, name, value, filePath);
        result.definitions.push(...next.definitions);
        result.diagnostics.push(...next.diagnostics);
        return result;
      },
      { definitions: [], diagnostics: [] },
    );
  }

  return coerceSingleExampleDefinition(
    target,
    explicitName || options.fallbackName,
    source,
    filePath,
  );
}

function coerceSingleExampleDefinition(
  target: JSDocExampleDefinition["target"],
  name: string,
  source: unknown,
  filePath: string | undefined,
): { definitions: JSDocExampleDefinition[]; diagnostics: Diagnostic[] } {
  if (isExampleDescriptor(source)) {
    const exampleName = typeof source.name === "string" ? source.name : name;

    if (typeof source.ref === "string") {
      return resolveExampleReference(target, exampleName, source.ref, filePath, false);
    }

    return {
      definitions: [
        {
          target,
          name: exampleName,
          ...(typeof source.summary === "string" ? { summary: source.summary } : {}),
          ...(typeof source.description === "string" ? { description: source.description } : {}),
          ...(typeof source.value !== "undefined" ? { value: source.value as JsonValue } : {}),
          ...(typeof source.serializedValue === "string"
            ? { serializedValue: source.serializedValue }
            : {}),
          ...(typeof source.externalValue === "string"
            ? { externalValue: source.externalValue }
            : {}),
        },
      ],
      diagnostics: [],
    };
  }

  return {
    definitions: [
      {
        target,
        name,
        value: source as JsonValue,
      },
    ],
    diagnostics: [],
  };
}

function resolveExampleReference(
  target: JSDocExampleDefinition["target"],
  explicitName: string | undefined,
  referenceName: string,
  filePath: string | undefined,
  allowCollectionExpansion: boolean,
): { definitions: JSDocExampleDefinition[]; diagnostics: Diagnostic[] } {
  if (!referenceName) {
    return { definitions: [], diagnostics: [] };
  }

  if (!filePath) {
    return {
      definitions: [],
      diagnostics: [
        {
          code: "example-reference-unresolved",
          severity: "warning",
          message: `Could not resolve example reference "${referenceName}" without a source file path.`,
        },
      ],
    };
  }

  const resolved = resolveTypeScriptValueReference(referenceName, filePath);
  if (!("value" in resolved) || typeof resolved.value === "undefined") {
    return {
      definitions: [],
      diagnostics: resolved.diagnostic ? [resolved.diagnostic] : [],
    };
  }

  return normalizeExampleSource(target, explicitName, resolved.value, filePath, {
    allowCollectionExpansion,
    fallbackName: explicitName || referenceName,
  });
}

function createSingleExampleDefinition(
  target: JSDocExampleDefinition["target"],
  name: string,
  payload: string,
): { definitions: JSDocExampleDefinition[]; diagnostics: Diagnostic[] } {
  return {
    definitions: [
      {
        target,
        name,
        ...(isExampleExternalValue(payload) ? { externalValue: payload } : {}),
        ...(payload.startsWith("serialized:")
          ? { serializedValue: payload.slice("serialized:".length).trim() }
          : {}),
        ...(!isExampleExternalValue(payload) && !payload.startsWith("serialized:")
          ? { value: parseJsonValue(payload) }
          : {}),
      },
    ],
    diagnostics: [],
  };
}

function getGeneratedExampleName(baseName: string, index: number): string {
  return index === 0 ? baseName : `${baseName}${index + 1}`;
}

function isExampleExternalValue(value: string): boolean {
  return value.startsWith("http://") || value.startsWith("https://");
}

function isExampleDescriptor(value: unknown): value is Record<string, unknown> {
  if (!isExampleMap(value)) {
    return false;
  }

  return (
    "name" in value ||
    "summary" in value ||
    "description" in value ||
    "value" in value ||
    "externalValue" in value ||
    "serializedValue" in value ||
    "ref" in value
  );
}

function isExampleDescriptorMap(value: unknown): value is Record<string, unknown> {
  if (!isExampleMap(value) || isExampleDescriptor(value)) {
    return false;
  }

  return Object.values(value).every((entry) => isExampleMap(entry) || Array.isArray(entry));
}

function isExampleMap(value: unknown): value is OpenApiExampleMap {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function escapeRegExp(value: string): string {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function cleanSpec(spec: OpenApiDocument): OpenApiDocument {
  const newSpec = structuredClone(spec);

  for (const internalKey of INTERNAL_OPENAPI_CONFIG_KEYS) {
    delete newSpec[internalKey];
  }

  // Process paths to ensure good examples for path parameters
  if (newSpec.paths) {
    Object.keys(newSpec.paths).forEach((path) => {
      const pathDefinition = newSpec.paths?.[path];
      if (!pathDefinition) {
        return;
      }

      // Check if path contains parameters
      if (path.includes("{") && path.includes("}")) {
        // For each HTTP method in this path
        Object.keys(pathDefinition).forEach((method) => {
          const operation = pathDefinition[method];
          if (!operation) {
            return;
          }

          // Set example properties for each path parameter
          if (operation.parameters) {
            operation.parameters.forEach((param: ParamSchema) => {
              if (param.in === "path" && !param.example) {
                // Generate an example based on parameter name
                if (param.name === "id" || param.name.endsWith("Id")) {
                  param.example = 123;
                } else if (param.name === "slug") {
                  param.example = "example-slug";
                } else {
                  param.example = "example";
                }
              }
            });
          }
        });
      }
    });
  }

  return newSpec;
}

const INTERNAL_OPENAPI_CONFIG_KEYS = [
  "apiDir",
  "routerType",
  "schemaDir",
  "docsUrl",
  "ui",
  "outputFile",
  "outputDir",
  "includeOpenApiRoutes",
  "ignoreRoutes",
  "schemaType",
  "schemaBackends",
  "schemaFiles",
  "defaultResponseSet",
  "responseSets",
  "errorConfig",
  "errorDefinitions",
  "openapiVersion",
  "framework",
  "next",
  "diagnostics",
  "debug",
] as const;

const AUTH_PRESET_REPLACEMENTS: Record<string, string> = {
  bearer: "BearerAuth",
  basic: "BasicAuth",
  apikey: "ApiKeyAuth",
};

export function performAuthPresetReplacements(authValue: string): string {
  const authParts = authValue.split(",").map((part) => part.trim());
  const mappedParts = authParts.map((part) => AUTH_PRESET_REPLACEMENTS[part.toLowerCase()] || part);

  return mappedParts.join(",");
}

export function getOperationId(routePath: string, method: string) {
  const operation = routePath.replaceAll(/\//g, "-").replace(/^-/, "");

  return `${method}-${operation}`;
}

/**
 * Common Babel parser configuration for TypeScript files with JSX support
 */
const DEFAULT_PARSER_OPTIONS: ParserOptions = {
  sourceType: "module",
  plugins: ["typescript", "jsx", "decorators-legacy"],
};

/**
 * Parse TypeScript/TSX file content with the standard configuration
 * @param content - File content to parse
 * @param options - Optional parser options to override defaults
 * @returns Parsed AST
 */
export function parseTypeScriptFile(content: string, options?: Partial<ParserOptions>): t.File {
  return parse(content, {
    ...DEFAULT_PARSER_OPTIONS,
    ...options,
  });
}
