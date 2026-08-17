import type { NodePath } from "@babel/traverse";
import type * as t from "@babel/types";

import { escapeRegExp, toCamelCase } from "./strings.js";
import type {
  DataTypes,
  Diagnostic,
  JSDocExampleDefinition,
  JsonValue,
  OpenApiEncoding,
  OpenApiExampleMap,
} from "./types.js";
import { resolveTypeScriptValueReference } from "./typescript-project.js";

const DEPRECATED_LINE_RE = /^[ \t]*\*?[ \t]*@deprecated[ \t]+([^\n\r]+)/m;
const WEBHOOK_PRESENCE_RE = /@webhook(\s|$)/;
const RESPONSE_TAG_RE = /@response\s+([^\n\r@]+)/g;
const ADD_TAG_RE = /@add\s+([^\n\r@]*)/g;
const TAG_TAG_RE = /@tag\s+([^\n\r@]*)/g;
const SERVERS_TAG_RE = /^\s*\*?\s*@servers?\s+([^\n\r]+)/gm;
const EXTERNAL_DOCS_TAG_RE = /^\s*\*?\s*@externalDocs\s+([^\n\r]+)/m;
const SECURITY_TAG_RE = /^\s*\*?\s*@security\s+([^\n\r]+)/gm;
const RESPONSE_HEADER_TAG_RE = /^\s*\*?\s*@responseHeader\s+([^\n\r]+)/gm;
const LINK_TAG_RE = /^\s*\*?\s*@link\s+([^\n\r]+)/gm;
const CALLBACK_TAG_RE = /^\s*\*?\s*@callback\s+([^\n\r]+)/gm;
const OPENAPI_OVERRIDE_RE = /@openapi-override\s+(\{[\s\S]*?\})\s*(?=(?:\n\s*(?:\*\s*)?@|\n?$))/;
const QUERYSTRING_TAG_RE = /@querystring\s+([^\s]+)(?:\s+as\s+(\S+))?/m;
const RESPONSE_SINGLE_RE = /@response\s+([^\n\r@]+)/;
const INTERNAL_FLAG_RE = /@internal\b/;
const SCHEMA_FALSE_RE = /@schema\s+false\b/;
const COMMENT_STAR_RE = /\*\s*/g;

const boundedTagRegexCache = new Map<string, RegExp>();
const lineValueRegexCache = new Map<string, RegExp>();
const tokenValueRegexCache = new Map<string, RegExp>();
const typeFromCommentRegexCache = new Map<string, RegExp>();
const exampleTagRegexCache = new Map<string, RegExp>();

function getCachedRegex(cache: Map<string, RegExp>, key: string, create: () => RegExp): RegExp {
  const existing = cache.get(key);
  if (existing) {
    existing.lastIndex = 0;
    return existing;
  }
  const created = create();
  cache.set(key, created);
  return created;
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
  if (result.deprecated) {
    const deprecatedMatch = normalizedComment.match(DEPRECATED_LINE_RE);
    const deprecatedValue = deprecatedMatch?.[1]?.trim();
    if (deprecatedValue) {
      result.deprecationReason = deprecatedValue;
    }
  }

  const webhookValue = extractLineValue(normalizedComment, "@webhook");
  if (normalizedComment.match(WEBHOOK_PRESENCE_RE)) {
    result.isWebhook = true;
    if (webhookValue) {
      result.webhookName = webhookValue;
    }
  }

  const firstLine = normalizedComment.split("\n")[0] as string;
  if (!firstLine.trim().startsWith("@")) {
    result.summary = firstLine.trim();
  }

  const explicitSummary = extractLineValue(normalizedComment, "@summary");
  if (explicitSummary) {
    result.summary = explicitSummary;
  }

  result.description = extractLineValue(normalizedComment, "@description");
  result.tagSummary = extractLineValue(normalizedComment, "@tagSummary");
  result.tagDescription = extractLineValue(normalizedComment, "@tagDescription");
  result.tagKind = extractLineValue(normalizedComment, "@tagKind");
  result.tagParent = extractLineValue(normalizedComment, "@tagParent");
  result.bodyDescription = extractFirstBoundedLine(normalizedComment, [
    "@requestBodyDescription",
    "@bodyDescription",
  ]);
  result.contentType = extractFirstBoundedLine(normalizedComment, [
    "@requestContentType",
    "@contentType",
  ]);
  result.responseContentType = extractLineValue(normalizedComment, "@responseContentType");
  result.responseDescription = extractLineValue(normalizedComment, "@responseDescription");
  result.responseSet = extractLineValue(normalizedComment, "@responseSet");
  result.operationId = extractTokenValue(normalizedComment, "@operationId");
  result.method = extractTokenValue(normalizedComment, "@method").toUpperCase();
  result.paramsType = extractFirstType(normalizedComment, ["@query", "@queryParams", "@params"]);
  result.pathParamsType = extractFirstType(normalizedComment, ["@path", "@pathParams"]);
  result.headerType = extractTypeFromComment(normalizedComment, "@header");
  result.cookieType = extractTypeFromComment(normalizedComment, "@cookie");

  const requestBody = parseRequestBodyTag(normalizedComment);
  result.bodyType = requestBody.typeName;
  if (requestBody.required) {
    result.requestBodyRequired = true;
  }

  const itemSchemas = parseTargetedTypeTag(normalizedComment, ["@itemSchema", "@responseItem"]);
  if (itemSchemas.response) {
    result.responseItemType = itemSchemas.response;
  }
  if (itemSchemas.request) {
    result.requestItemType = itemSchemas.request;
  }

  const responseSummaries = parseResponseSummaryTags(normalizedComment);
  if (responseSummaries.primary) {
    result.responseSummary = responseSummaries.primary;
  }
  if (Object.keys(responseSummaries.byStatus).length > 0) {
    result.responseSummaries = responseSummaries.byStatus;
  }

  const authValue = extractLineValue(normalizedComment, "@auth");
  if (authValue) {
    result.auth = authValue;
  }

  const querystring = parseQuerystringTag(normalizedComment);
  if (querystring) {
    result.querystringType = querystring.typeName;
    result.querystringName = querystring.name;
  }

  const itemEncodings = parseTargetedJsonTag(normalizedComment, [
    "@itemEncoding",
    "@responseItemEncoding",
  ]);
  if (isEncodingObject(itemEncodings.response)) {
    result.responseItemEncoding = itemEncodings.response;
  }
  if (isEncodingObject(itemEncodings.request)) {
    result.requestItemEncoding = itemEncodings.request;
  }

  const prefixEncodings = parseTargetedJsonTag(normalizedComment, [
    "@prefixEncoding",
    "@responsePrefixEncoding",
  ]);
  if (Array.isArray(prefixEncodings.response) && prefixEncodings.response.every(isEncodingObject)) {
    result.responsePrefixEncoding = prefixEncodings.response as OpenApiEncoding[];
  }
  if (Array.isArray(prefixEncodings.request) && prefixEncodings.request.every(isEncodingObject)) {
    result.requestPrefixEncoding = prefixEncodings.request as OpenApiEncoding[];
  }

  const responseMatches = [...normalizedComment.matchAll(RESPONSE_TAG_RE)];
  if (responseMatches.length > 0) {
    const firstRaw = responseMatches[0]?.[1]?.trim();
    if (firstRaw) {
      const parsedResponse = parseResponseRawValue(firstRaw);
      result.successCode = parsedResponse.successCode;
      result.responseType = parsedResponse.responseType;
      if (!result.responseDescription && parsedResponse.responseDescription) {
        result.responseDescription = parsedResponse.responseDescription;
      }
    }
    const extraResponses = responseMatches
      .slice(1)
      .map((m) => m[1]?.trim())
      .filter((t): t is string => Boolean(t));
    if (extraResponses.length > 0) {
      result.addResponses = extraResponses.join(",");
    }
  }

  const addMatches = [...normalizedComment.matchAll(ADD_TAG_RE)];
  if (addMatches.length > 0) {
    const addEntries = addMatches
      .map((match) => match[1]?.trim() || "")
      .filter(Boolean)
      .join(",");
    if (addEntries) {
      result.addResponses = result.addResponses
        ? `${result.addResponses},${addEntries}`
        : addEntries;
    }
  }

  const examples = collectExampleDefinitions(normalizedComment, "@examples", filePath);
  result.requestExamples = buildExampleMap(examples.definitions, "request");
  result.responseExamples = buildExampleMap(examples.definitions, "response");
  result.querystringExamples = buildExampleMap(examples.definitions, "querystring");
  result.queryExamples = buildExampleMap(examples.definitions, "query");
  result.headerExamples = buildExampleMap(examples.definitions, "header");
  result.cookieExamples = buildExampleMap(examples.definitions, "cookie");
  if (examples.diagnostics.length > 0) {
    result.diagnostics = examples.diagnostics;
  }

  const additionalTags = extractListValue(normalizedComment, "@tags");
  if (additionalTags.length > 0) {
    result.tags = additionalTags;
  }

  const tagMatches = [...normalizedComment.matchAll(TAG_TAG_RE)];
  if (tagMatches.length > 0) {
    const primaryTag = tagMatches[0]?.[1]?.trim();
    if (primaryTag) {
      result.tag = primaryTag;
    }
    const extraTags = tagMatches
      .slice(1)
      .map((m) => m[1]?.trim())
      .filter((t): t is string => Boolean(t));
    if (extraTags.length > 0) {
      result.tags = [...(result.tags ?? []), ...extraTags];
    }
  }

  const servers = parseServersTag(normalizedComment);
  if (servers.length > 0) {
    result.servers = servers;
  }

  const externalDocs = parseExternalDocsTag(normalizedComment);
  if (externalDocs) {
    result.externalDocs = externalDocs;
  }

  const security = parseSecurityTag(normalizedComment);
  if (security.length > 0) {
    result.security = security;
  }

  const responseHeaders = parseResponseHeaderTags(normalizedComment);
  if (responseHeaders.length > 0) {
    result.responseHeaders = responseHeaders;
  }

  const responseLinks = parseLinkTags(normalizedComment);
  if (responseLinks.length > 0) {
    result.responseLinks = responseLinks;
  }

  const callbacks = parseCallbackTags(normalizedComment);
  if (callbacks.length > 0) {
    result.callbacks = callbacks;
  }

  const override = parseOpenApiOverrideTag(normalizedComment);
  if (override) {
    result.openapiOverride = override;
  }

  return result;
}

function extractListValue(commentValue: string, tag: string): string[] {
  const raw = extractLineValue(commentValue, tag);
  if (!raw) {
    return [];
  }
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function boundedTagRegex(tag: string, flags = "gm"): RegExp {
  return getCachedRegex(
    boundedTagRegexCache,
    `${tag}:${flags}`,
    () => new RegExp(`^\\s*\\*?\\s*${escapeRegExp(tag)}(?![A-Za-z0-9_-])\\s*([^\\n\\r]*)`, flags),
  );
}

function extractBoundedLine(commentValue: string, tag: string): string {
  return commentValue.match(boundedTagRegex(tag, "m"))?.[1]?.trim() || "";
}

function extractFirstBoundedLine(commentValue: string, tags: string[]): string {
  for (const tag of tags) {
    const value = extractBoundedLine(commentValue, tag);
    if (value) {
      return value;
    }
  }
  return "";
}

function extractFirstType(commentValue: string, tags: string[]): string {
  for (const tag of tags) {
    const value = extractTypeFromComment(commentValue, tag);
    if (value) {
      return value;
    }
  }
  return "";
}

function consumeRequiredFlag(raw: string): { rest: string; required?: boolean } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { rest: "" };
  }
  if (/^required(?:\s*=\s*true)?$/i.test(trimmed)) {
    return { rest: "", required: true };
  }
  if (/^required\s*=\s*false$/i.test(trimmed) || /^optional$/i.test(trimmed)) {
    return { rest: "", required: false };
  }
  if (/\s+required(?:\s*=\s*true)?$/i.test(trimmed)) {
    return {
      rest: trimmed.replace(/\s+required(?:\s*=\s*true)?$/i, "").trim(),
      required: true,
    };
  }
  if (/\s+(?:optional|required\s*=\s*false)$/i.test(trimmed)) {
    return {
      rest: trimmed.replace(/\s+(?:optional|required\s*=\s*false)$/i, "").trim(),
      required: false,
    };
  }
  return { rest: trimmed };
}

function parseRequestBodyTag(commentValue: string): { typeName: string; required: boolean } {
  let typeName = "";
  let required = false;

  for (const tag of ["@requestBody", "@body"] as const) {
    for (const match of commentValue.matchAll(boundedTagRegex(tag))) {
      const parsed = consumeRequiredFlag(match[1] as string);
      if (parsed.required === true) {
        required = true;
      }
      if (parsed.rest && (tag === "@requestBody" || !typeName)) {
        typeName = parsed.rest;
      }
    }
  }

  return { typeName, required };
}

function splitMediaTarget(raw: string): { target: "request" | "response"; value: string } {
  const match = raw.match(/^(request|response)\s*:\s*([\s\S]+)$/);
  if (match?.[1] === "request" || match?.[1] === "response") {
    return { target: match[1], value: (match[2] as string).trim() };
  }
  return { target: "response", value: raw };
}

function parseTargetedTypeTag(
  commentValue: string,
  tags: string[],
): { request?: string; response?: string } {
  const result: { request?: string; response?: string } = {};
  for (const tag of tags) {
    for (const match of commentValue.matchAll(boundedTagRegex(tag))) {
      const raw = match[1]?.trim();
      if (!raw) {
        continue;
      }
      const { target, value } = splitMediaTarget(raw);
      const typeName = value.split(/\s+/)[0];
      if (typeName) {
        result[target] = typeName;
      }
    }
  }
  return result;
}

function parseTargetedJsonTag(
  commentValue: string,
  tags: string[],
): { request?: JsonValue; response?: JsonValue } {
  const result: { request?: JsonValue; response?: JsonValue } = {};
  for (const tag of tags) {
    for (const match of commentValue.matchAll(boundedTagRegex(tag))) {
      const raw = match[1]?.trim();
      if (!raw) {
        continue;
      }
      const { target, value } = splitMediaTarget(raw);
      result[target] = parseJsonValue(value);
    }
  }
  return result;
}

function parseResponseSummaryTags(commentValue: string): {
  primary?: string | undefined;
  byStatus: Record<string, string>;
} {
  const byStatus: Record<string, string> = {};
  let primary: string | undefined;

  for (const match of commentValue.matchAll(boundedTagRegex("@responseSummary"))) {
    const raw = match[1]?.trim();
    if (!raw) {
      continue;
    }
    const statusMatch = raw.match(/^(\S+)\s+([\s\S]+)$/);
    if (statusMatch?.[1] && statusMatch[2] && isStatusCodeToken(statusMatch[1])) {
      byStatus[statusMatch[1]] = statusMatch[2].trim();
      continue;
    }
    primary = raw;
  }

  return { primary, byStatus };
}

function parseServersTag(commentValue: string): import("./types.js").OpenApiServer[] {
  const matches = [...commentValue.matchAll(SERVERS_TAG_RE)];
  const servers: import("./types.js").OpenApiServer[] = [];
  for (const match of matches) {
    const raw = (match[1] as string).trim();
    // format: <url> [description...]
    const spaceIdx = raw.indexOf(" ");
    const url = spaceIdx === -1 ? raw : raw.slice(0, spaceIdx);
    const description = spaceIdx === -1 ? undefined : raw.slice(spaceIdx + 1).trim();
    const server: import("./types.js").OpenApiServer = { url };
    if (description) {
      server.description = description.replace(/^["']|["']$/g, "");
    }
    servers.push(server);
  }
  return servers;
}

function parseExternalDocsTag(
  commentValue: string,
): import("./types.js").JSDocExternalDocs | undefined {
  const match = commentValue.match(EXTERNAL_DOCS_TAG_RE);
  const raw = match?.[1]?.trim();
  if (!raw) {
    return undefined;
  }
  const spaceIdx = raw.indexOf(" ");
  const url = spaceIdx === -1 ? raw : raw.slice(0, spaceIdx).trim();
  const description = spaceIdx === -1 ? undefined : raw.slice(spaceIdx + 1).trim();
  return description ? { url, description: description.replace(/^["']|["']$/g, "") } : { url };
}

function parseSecurityTag(commentValue: string): import("./types.js").OpenApiSecurityRequirement[] {
  const matches = [...commentValue.matchAll(SECURITY_TAG_RE)];
  const requirements: import("./types.js").OpenApiSecurityRequirement[] = [];
  for (const match of matches) {
    const raw = (match[1] as string).trim();
    // format: <scheme>[:scope1,scope2][; <scheme2>[:scope...]]
    const entry: import("./types.js").OpenApiSecurityRequirement = {};
    const segments = raw
      .split(";")
      .map((segment) => segment.trim())
      .filter(Boolean);
    for (const segment of segments) {
      const [schemeRaw, scopesRaw] = segment.split(":");
      const scheme = schemeRaw?.trim();
      if (!scheme) {
        continue;
      }
      const scopes = scopesRaw
        ? scopesRaw
            .split(",")
            .map((scope) => scope.trim())
            .filter(Boolean)
        : [];
      entry[scheme] = scopes;
    }
    if (Object.keys(entry).length > 0) {
      requirements.push(entry);
    }
  }
  return requirements;
}

function parseResponseHeaderTags(commentValue: string): import("./types.js").JSDocResponseHeader[] {
  const matches = [...commentValue.matchAll(RESPONSE_HEADER_TAG_RE)];
  const headers: import("./types.js").JSDocResponseHeader[] = [];
  for (const match of matches) {
    const raw = (match[1] as string).trim();
    // format: <status> <name> <schemaRef|primitiveType> [description...]
    const tokens = raw.split(/\s+/);
    if (tokens.length < 3 || !tokens[0] || !tokens[1] || !tokens[2]) {
      continue;
    }
    const [status, name, type, ...rest] = tokens;
    const description = rest.length > 0 ? rest.join(" ") : undefined;
    const schema = parameterTypeTokenToSchema(type);
    const header: import("./types.js").JSDocResponseHeader = { status, name };
    if (schema) {
      header.schema = schema;
    }
    if (description) {
      header.description = description;
    }
    headers.push(header);
  }
  return headers;
}

function parameterTypeTokenToSchema(
  type: string,
): import("./types.js").OpenApiSchemaLike | undefined {
  const primitive = type.toLowerCase();
  if (
    primitive === "string" ||
    primitive === "number" ||
    primitive === "integer" ||
    primitive === "boolean"
  ) {
    return { type: primitive };
  }
  // Treat anything else as a component schema reference
  if (/^[A-Za-z_$][\w$]*$/.test(type)) {
    return { $ref: `#/components/schemas/${type}` };
  }
  return undefined;
}

function parseLinkTags(commentValue: string): import("./types.js").JSDocResponseLink[] {
  const matches = [...commentValue.matchAll(LINK_TAG_RE)];
  const links: import("./types.js").JSDocResponseLink[] = [];
  for (const match of matches) {
    const raw = (match[1] as string).trim();
    // format: <status> <name> <operationId|ref> [parametersJson]
    const statusMatch = raw.match(/^(\S+)\s+(\S+)\s+(\S+)(?:\s+(\{[\s\S]*\}))?$/);
    if (!statusMatch) {
      continue;
    }
    const [, status, name, target, paramsJson] = statusMatch as [
      string,
      string,
      string,
      string,
      string | undefined,
    ];
    const link: import("./types.js").JSDocResponseLink = { status, name };
    if (target.startsWith("#/") || target.startsWith("/")) {
      link.operationRef = target;
    } else {
      link.operationId = target;
    }
    if (paramsJson) {
      const parsed = parseJsonValue(paramsJson);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        link.parameters = parsed as Record<string, JsonValue>;
      }
    }
    links.push(link);
  }
  return links;
}

function parseCallbackTags(commentValue: string): import("./types.js").JSDocCallback[] {
  const matches = [...commentValue.matchAll(CALLBACK_TAG_RE)];
  const callbacks: import("./types.js").JSDocCallback[] = [];
  for (const match of matches) {
    const raw = (match[1] as string).trim();
    // format: <name> <runtimeExpression> [reference]
    const tokens = raw.split(/\s+/);
    if (tokens.length < 2) {
      continue;
    }
    const name = tokens[0] as string;
    const expression = tokens[1] as string;
    const reference = tokens[2];
    const callback: import("./types.js").JSDocCallback = { name, expression };
    if (reference) {
      callback.reference = reference;
    }
    callbacks.push(callback);
  }
  return callbacks;
}

export function parseOpenApiOverrideTag(
  commentValue: string,
): Record<string, JsonValue> | undefined {
  const match = commentValue.match(OPENAPI_OVERRIDE_RE);
  const raw = match?.[1]?.trim();
  if (!raw) {
    return undefined;
  }
  const parsed = parseJsonValue(raw);
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    return parsed as Record<string, JsonValue>;
  }
  return undefined;
}

export function extractTypeFromComment(commentValue: string, tag: string): string {
  return (
    commentValue
      .match(
        getCachedRegex(
          typeFromCommentRegexCache,
          tag,
          () => new RegExp(`^\\s*\\*?\\s*${tag}\\s+([\\w<>,\\s[\\]]+)`, "m"),
        ),
      )?.[1]
      ?.trim() || ""
  );
}

export function parseResponseTag(commentValue: string): {
  responseDescription: string;
  responseType: string;
  successCode: string;
} | null {
  const rawValue = commentValue.match(RESPONSE_SINGLE_RE)?.[1]?.trim();
  if (!rawValue) {
    return null;
  }
  return parseResponseRawValue(rawValue);
}

function parseResponseRawValue(rawValue: string): {
  responseDescription: string;
  responseType: string;
  successCode: string;
} {
  if (isStatusCodeToken(rawValue)) {
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

  if (segments[0] && isStatusCodeToken(segments[0])) {
    successCode = segments.shift() as string;
    const remainingValue = segments.join(":").trim();
    if (isInlineResponseType(remainingValue)) {
      return {
        responseDescription: "",
        responseType: remainingValue,
        successCode,
      };
    }
  }

  if (isInlineResponseType(responseType)) {
    return {
      responseDescription: "",
      responseType,
      successCode,
    };
  }

  if (segments.length > 0) {
    responseType = segments.shift() as string;
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

function isInlineResponseType(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.startsWith("{") || trimmed.startsWith("[");
}

function isStatusCodeToken(value: string): boolean {
  if (/^\d{3}$/.test(value)) {
    return true;
  }
  if (/^[1-5]XX$/.test(value)) {
    return true;
  }
  return value === "default";
}

function createEmptyDataTypes(): DataTypes {
  return {
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
    isOpenApi: false,
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
  return commentValue.replace(COMMENT_STAR_RE, "").trim();
}

export function extractInternalFlagFromComments(
  comments: ReadonlyArray<{ type: string; value: string }> | null | undefined,
): boolean {
  if (!comments) return false;
  for (const comment of comments) {
    const cleaned = cleanComment(comment.value);
    if (INTERNAL_FLAG_RE.test(cleaned) || SCHEMA_FALSE_RE.test(cleaned)) {
      return true;
    }
  }
  return false;
}

export function extractSchemaIdFromComments(
  comments: ReadonlyArray<{ type: string; value: string }> | null | undefined,
): string | null {
  if (!comments) return null;
  for (const comment of comments) {
    const cleaned = cleanComment(comment.value);
    const id = extractTokenValue(cleaned, "@id");
    if (id) return id;
  }
  return null;
}

function extractLineValue(commentValue: string, tag: string): string {
  return (
    commentValue
      .match(
        getCachedRegex(
          lineValueRegexCache,
          tag,
          () => new RegExp(`${escapeRegExp(tag)}\\s*(.*)`, "m"),
        ),
      )?.[1]
      ?.trim() || ""
  );
}

function extractTokenValue(commentValue: string, tag: string): string {
  return (
    commentValue
      .match(
        getCachedRegex(
          tokenValueRegexCache,
          tag,
          () => new RegExp(`${escapeRegExp(tag)}\\s+(\\S+)`, "m"),
        ),
      )?.[1]
      ?.trim() || ""
  );
}

function parseQuerystringTag(commentValue: string): { typeName: string; name: string } | null {
  const match = commentValue.match(QUERYSTRING_TAG_RE);
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
    ...commentValue.matchAll(
      getCachedRegex(
        exampleTagRegexCache,
        tag,
        () => new RegExp(`${escapeRegExp(tag)}\\s+([^\\n\\r@]+)`, "g"),
      ),
    ),
  ];
  return matches.reduce<{ definitions: JSDocExampleDefinition[]; diagnostics: Diagnostic[] }>(
    (result, match) => {
      const parsed = parseExampleDefinition(match[1] as string, filePath);
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

  const target = normalizeExampleTarget(rawValue.slice(0, firstColon).trim());
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
        ...(typeof definition.dataValue !== "undefined"
          ? { dataValue: definition.dataValue }
          : typeof definition.value !== "undefined"
            ? { value: definition.value }
            : {}),
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

function isExampleTarget(value: string): value is JSDocExampleDefinition["target"] {
  return (
    value === "request" ||
    value === "response" ||
    value === "querystring" ||
    value === "query" ||
    value === "header" ||
    value === "cookie"
  );
}

function normalizeExampleTarget(value: string): string {
  if (value === "body") {
    return "request";
  }

  return value;
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
          ...(typeof source.dataValue !== "undefined"
            ? { dataValue: source.dataValue as JsonValue }
            : typeof source.value !== "undefined"
              ? { value: source.value as JsonValue }
              : {}),
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

function isEncodingObject(value: unknown): value is OpenApiEncoding {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
