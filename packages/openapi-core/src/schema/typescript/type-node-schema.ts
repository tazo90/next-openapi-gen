import * as t from "@babel/types";

import { parseOpenApiOverrideTag } from "../../shared/jsdoc.js";
import { logger } from "../../shared/logger.js";
import type { SymbolResolver } from "../../shared/symbol-resolver.js";
import type { ContentType, OpenAPIDefinition } from "../../shared/types.js";
import { extractFunctionParameters, extractFunctionReturnType } from "./function-nodes.js";
import { extractKeysFromLiteralType, getPropertyOptions, isDateNode } from "./helpers.js";
import { resolveUtilityTypeReference } from "./utility-types.js";

export type TypeNodeSchemaHost = {
  addTypeResolutionFallbackDiagnostic: (
    message: string,
    metadata?: Record<string, unknown>,
  ) => void;
  areTypesStaticallyCompatible: (left: t.Node, right: t.Node) => boolean;
  collectAllExportedDefinitions: (ast: t.File, filePath?: string) => void;
  collectImports: (ast: t.File, filePath: string) => void;
  collectTypeDefinitions: (ast: t.File, schemaName: string, filePath?: string) => void;
  contentType: ContentType;
  currentFilePath: string;
  extractKeysFromTypeNode: (node: t.Node | null | undefined) => string[];
  fileAccess: Pick<
    typeof import("node:fs"),
    "existsSync" | "readdirSync" | "statSync" | "readFileSync"
  >;
  findSchemaDefinition: (schemaName: string, contentType: ContentType) => OpenAPIDefinition;
  importMap: Record<string, Record<string, string>>;
  isResolvingPickOmitBase: boolean;
  openapiDefinitions: Record<string, OpenAPIDefinition>;
  processSchemaFile: (filePath: string, schemaName: string) => OpenAPIDefinition | undefined;
  processingTypes: Set<string>;
  resolveGenericType: (
    genericTypeDefinition: unknown,
    typeArguments: unknown[],
    typeName: string,
  ) => OpenAPIDefinition;
  resolveImportPath: (importPath: string, fromFilePath: string) => string | null;
  resolveType: (typeName: string) => OpenAPIDefinition;
  schemaIdAliases: Record<string, string>;
  schemaTypes: string[];
  symbolResolver: SymbolResolver;
  typeDefinitions: Record<string, any>;
  unwrapSchemaProperties: (
    schema: OpenAPIDefinition | undefined,
  ) => Record<string, OpenAPIDefinition> | null;
  zodSchemaConverter: {
    convertZodSchemaToOpenApi: (name: string, contentType: ContentType) => OpenAPIDefinition | null;
  } | null;
};

export function isBinaryNode(node: any): boolean {
  // Match TS references to common runtime binary types so `File`, `Blob`, etc. become
  // `{ type: "string", contentMediaType: "application/octet-stream" }` instead of falling back to `{}`.
  if (!t.isTSTypeReference(node)) return false;
  const typeName = node.typeName;
  if (!t.isIdentifier(typeName)) return false;
  return (
    typeName.name === "File" ||
    typeName.name === "Blob" ||
    typeName.name === "Buffer" ||
    typeName.name === "ArrayBuffer" ||
    typeName.name === "Uint8Array" ||
    typeName.name === "ReadableStream"
  );
}

export function enumerateTemplateLiteralType(node: t.Node | null | undefined): string[] | null {
  if (!node) return null;
  if (t.isTSLiteralType(node)) {
    const literal = node.literal;
    if (t.isStringLiteral(literal)) return [literal.value];
    if (t.isNumericLiteral(literal)) return [String(literal.value)];
    if (t.isBooleanLiteral(literal)) return [String(literal.value)];
    return null;
  }
  if (t.isTSUnionType(node)) {
    const values: string[] = [];
    for (const sub of node.types) {
      const resolved = enumerateTemplateLiteralType(sub);
      if (!resolved) return null;
      values.push(...resolved);
    }
    return values;
  }
  return null;
}

export function tryResolveTemplateLiteralEnum(
  node: t.TSTemplateLiteralType,
): OpenAPIDefinition | null {
  const { quasis, types } = node;
  if (types.length === 0) {
    // `\`literal\`` — emit as a single-value string enum.
    return { type: "string", enum: [quasis.map((q) => q.value.cooked ?? "").join("")] };
  }
  const groups: string[][] = [];
  for (const interpolation of types) {
    const resolved = enumerateTemplateLiteralType(interpolation);
    if (!resolved) return null;
    groups.push(resolved);
  }
  const staticParts = quasis.map((q) => q.value.cooked ?? "");
  let combinations: string[] = [staticParts[0] ?? ""];
  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    if (!group) continue;
    const next: string[] = [];
    for (const prefix of combinations) {
      for (const insert of group) {
        next.push(`${prefix}${insert}${staticParts[i + 1] ?? ""}`);
      }
    }
    combinations = next;
  }
  return { type: "string", enum: combinations };
}

export function tryBuildTemplateLiteralPattern(node: t.TSTemplateLiteralType): string | null {
  const { quasis, types } = node;
  const parts: string[] = [];
  const escapeRegex = (source: string) => source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  for (let i = 0; i < quasis.length; i++) {
    const quasi = quasis[i];
    if (!quasi) continue;
    parts.push(escapeRegex(quasi.value.cooked ?? ""));
    if (i < types.length) {
      const interpolation = types[i];
      if (!interpolation) return null;
      if (
        t.isTSStringKeyword(interpolation) ||
        (t.isTSTypeReference(interpolation) &&
          t.isIdentifier(interpolation.typeName, { name: "Uppercase" }))
      ) {
        parts.push(".+");
      } else if (t.isTSNumberKeyword(interpolation)) {
        parts.push("\\d+");
      } else {
        return null;
      }
    }
  }
  return `^${parts.join("")}$`;
}

export function applyPropertyOpenApiOverride(member: any, property: Record<string, any>): void {
  const leadingComments: any[] | undefined = member?.leadingComments;
  if (!leadingComments || leadingComments.length === 0) return;
  for (const comment of leadingComments) {
    const override = parseOpenApiOverrideTag(comment.value ?? "");
    if (override) {
      Object.assign(property, override);
    }
  }
}

export function resolveTypeNodeSchema(host: TypeNodeSchemaHost, node: any): OpenAPIDefinition {
  if (!node) return { type: "object" }; // Default type for undefined/null

  if (t.isTSStringKeyword(node)) return { type: "string" };
  if (t.isTSNumberKeyword(node)) return { type: "number" };
  if (t.isTSBooleanKeyword(node)) return { type: "boolean" };
  if (t.isTSBigIntKeyword(node)) return { type: "integer", format: "int64" };
  if (t.isTSSymbolKeyword(node)) return { type: "string" };
  if (t.isTSObjectKeyword(node)) return { type: "object", additionalProperties: true };
  if (t.isTSNeverKeyword(node)) return { not: {} };
  // `any` / `unknown` mean "literally any value" — the empty JSON Schema (`{}`) is the
  // exact representation. Emitting `{ type: "object" }` was wrong for scalar values.
  if (t.isTSAnyKeyword(node) || t.isTSUnknownKeyword(node)) return {};
  if (t.isTSVoidKeyword(node) || t.isTSNullKeyword(node) || t.isTSUndefinedKeyword(node))
    return { type: "null" };
  if (isDateNode(node)) return { type: "string", format: "date-time" };
  if (isBinaryNode(node)) return { type: "string", contentMediaType: "application/octet-stream" };

  // Handle literal types like "admin" | "member" | "guest"
  if (t.isTSLiteralType(node)) {
    if (t.isStringLiteral(node.literal)) {
      return {
        type: "string",
        enum: [node.literal.value],
      };
    } else if (t.isNumericLiteral(node.literal)) {
      return {
        type: "number",
        enum: [node.literal.value],
      };
    } else if (t.isBooleanLiteral(node.literal)) {
      return {
        type: "boolean",
        enum: [node.literal.value],
      };
    } else if (t.isTemplateLiteral(node.literal)) {
      // Babel sometimes represents template-literal types as `TSLiteralType`
      // wrapping a regular `TemplateLiteral`. Reuse the enumeration helpers
      // by translating to the TS-specific shape expected by them.
      const template = node.literal;
      const synthetic = {
        type: "TSTemplateLiteralType",
        quasis: template.quasis,
        types: template.expressions,
      } as unknown as t.TSTemplateLiteralType;
      const literalEnum = tryResolveTemplateLiteralEnum(synthetic);
      if (literalEnum) return literalEnum;
      const pattern = tryBuildTemplateLiteralPattern(synthetic);
      return pattern ? { type: "string", pattern } : { type: "string" };
    }
  }

  // Handle TSExpressionWithTypeArguments (used in interface extends)
  if (t.isTSExpressionWithTypeArguments(node)) {
    if (t.isIdentifier(node.expression)) {
      // Convert to TSTypeReference-like structure for processing
      const syntheticNode = {
        type: "TSTypeReference",
        typeName: node.expression,
        typeParameters: node.typeParameters,
      };

      return resolveTypeNodeSchema(host, syntheticNode);
    }
  }

  // Handle indexed access types: SomeType[0] or SomeType["key"]
  if (t.isTSIndexedAccessType(node)) {
    const objectType = resolveTypeNodeSchema(host, node.objectType);
    const indexType = node.indexType;

    // Handle numeric index: Parameters<typeof func>[0]
    if (t.isTSLiteralType(indexType) && t.isNumericLiteral(indexType.literal)) {
      const index = indexType.literal.value;

      // If objectType is a tuple (has prefixItems), get the specific item
      if (objectType.prefixItems && Array.isArray(objectType.prefixItems)) {
        const tupleItem = objectType.prefixItems[index];
        if (tupleItem) {
          return tupleItem;
        }

        logger.warn(`Index ${index} is out of bounds for tuple type.`);
        return { type: "object" };
      }

      // If objectType is a regular array, return the items type
      if (objectType.type === "array" && objectType.items && typeof objectType.items === "object") {
        return objectType.items;
      }
    }

    // Handle string index: SomeType["propertyName"]
    if (t.isTSLiteralType(indexType) && t.isStringLiteral(indexType.literal)) {
      const key = indexType.literal.value;

      // If objectType has properties, get the specific property
      if (objectType.properties && objectType.properties[key]) {
        return objectType.properties[key];
      }
    }

    // Fallback
    return { type: "object" };
  }

  if (t.isTSTemplateLiteralType(node)) {
    // When all interpolated types are unions of string/number literal types, we can
    // materialise the full cartesian product as an enum. Otherwise emit a pattern based
    // on the template shape (or just `type: "string"` as a last resort).
    const literalEnum = tryResolveTemplateLiteralEnum(node);
    if (literalEnum) return literalEnum;
    const pattern = tryBuildTemplateLiteralPattern(node);
    return pattern ? { type: "string", pattern } : { type: "string" };
  }

  if (t.isTSConditionalType(node)) {
    return host.areTypesStaticallyCompatible(node.checkType, node.extendsType)
      ? resolveTypeNodeSchema(host, node.trueType)
      : resolveTypeNodeSchema(host, node.falseType);
  }

  if (t.isTSMappedType(node)) {
    const constraint = node.typeParameter.constraint;
    const keys = host.extractKeysFromTypeNode(constraint);
    if (keys.length === 0) {
      return { type: "object", properties: {} };
    }

    const valueType = node.typeAnnotation
      ? resolveTypeNodeSchema(host, node.typeAnnotation)
      : { type: "object" };
    const properties = Object.fromEntries(keys.map((key) => [key, structuredClone(valueType)]));
    return {
      type: "object",
      properties,
      required: keys,
    };
  }

  if (t.isTSImportType(node)) {
    if (
      t.isStringLiteral(node.argument) &&
      node.qualifier &&
      t.isIdentifier(node.qualifier) &&
      host.currentFilePath
    ) {
      const resolvedImportPath = host.resolveImportPath(node.argument.value, host.currentFilePath);
      if (resolvedImportPath) {
        host.processSchemaFile(resolvedImportPath, node.qualifier.name);
        const importedDefinition = host.typeDefinitions[node.qualifier.name];
        if (importedDefinition) {
          return host.resolveType(node.qualifier.name);
        }
      }
    }

    return { type: "object" };
  }

  if (t.isTSTypeOperator(node) && node.operator === "keyof") {
    // For `keyof` on a `$ref` target, follow the ref to the underlying definition to
    // compute the key list (the ref target hasn't had its properties copied onto the
    // schema yet).
    const sourceSchema = resolveTypeNodeSchema(host, node.typeAnnotation);
    const resolved = host.unwrapSchemaProperties(sourceSchema);
    if (resolved) {
      return { type: "string", enum: Object.keys(resolved) };
    }
    return { type: "string" };
  }

  if (t.isTSTypeOperator(node) && node.operator === "readonly") {
    // `readonly T[]` / `readonly [A, B]` — emit the underlying schema with `readOnly: true`.
    const inner = resolveTypeNodeSchema(host, node.typeAnnotation);
    return { ...inner, readOnly: true };
  }

  if (t.isTSTypeOperator(node) && node.operator === "unique") {
    // `unique symbol` — not expressible in OpenAPI; emit the underlying schema.
    return resolveTypeNodeSchema(host, node.typeAnnotation);
  }

  if (t.isTSTypeReference(node) && t.isTSQualifiedName(node.typeName)) {
    const left = node.typeName.left;
    const right = node.typeName.right;
    if (
      t.isIdentifier(left, { name: "z" }) &&
      t.isIdentifier(right, { name: "infer" }) &&
      node.typeParameters?.params.length
    ) {
      const firstTypeParameter = node.typeParameters.params[0];
      if (
        t.isTSTypeQuery(firstTypeParameter) &&
        t.isIdentifier(firstTypeParameter.exprName) &&
        host.schemaTypes.includes("zod") &&
        host.zodSchemaConverter
      ) {
        const schema = host.zodSchemaConverter.convertZodSchemaToOpenApi(
          firstTypeParameter.exprName.name,
          host.contentType,
        );
        if (schema) {
          return schema;
        }
      }
    }
  }

  if (t.isTSTypeReference(node) && t.isIdentifier(node.typeName)) {
    const typeName = node.typeName.name;

    // Special handling for built-in types
    if (typeName === "Date") {
      return { type: "string", format: "date-time" };
    }

    // Handle Promise<T> / Awaited<T> — unwrap to the resolved value.
    if (typeName === "Promise" || typeName === "Awaited") {
      if (node.typeParameters && node.typeParameters.params.length > 0) {
        return resolveTypeNodeSchema(host, node.typeParameters.params[0]);
      }
      return {};
    }

    if (typeName === "Array" || typeName === "ReadonlyArray") {
      if (node.typeParameters && node.typeParameters.params.length > 0) {
        return {
          type: "array",
          items: resolveTypeNodeSchema(host, node.typeParameters.params[0]),
        };
      }
      // Unknown element type — emit `type: "array"` without forcing `items: {type: object}`.
      return { type: "array" };
    }

    if (typeName === "Map" || typeName === "ReadonlyMap") {
      if (node.typeParameters && node.typeParameters.params.length > 1) {
        const keyType = resolveTypeNodeSchema(host, node.typeParameters.params[0]);
        const valueType = resolveTypeNodeSchema(host, node.typeParameters.params[1]);
        const schema: OpenAPIDefinition = {
          type: "object",
          additionalProperties: valueType,
        };
        const isTrivialStringKey =
          keyType.type === "string" && !keyType.enum && !keyType.pattern && !keyType.format;
        if (!isTrivialStringKey) {
          schema.propertyNames = keyType;
        }
        return schema;
      }
      return { type: "object", additionalProperties: true };
    }

    if (typeName === "Set" || typeName === "ReadonlySet") {
      if (node.typeParameters && node.typeParameters.params.length > 0) {
        return {
          type: "array",
          items: resolveTypeNodeSchema(host, node.typeParameters.params[0]),
          uniqueItems: true,
        };
      }
      return { type: "array", uniqueItems: true };
    }

    if (typeName === "Record") {
      if (node.typeParameters && node.typeParameters.params.length > 1) {
        const keyType = resolveTypeNodeSchema(host, node.typeParameters.params[0]);
        const valueType = resolveTypeNodeSchema(host, node.typeParameters.params[1]);

        const schema: OpenAPIDefinition = {
          type: "object",
          additionalProperties: valueType,
        };
        // If the key is a non-trivial schema (e.g. a pattern or literal union), surface it
        // as `propertyNames` so consumers can discover the shape of allowed keys.
        if (keyType && typeof keyType === "object" && keyType.type !== undefined) {
          const isTrivialStringKey =
            keyType.type === "string" && !keyType.enum && !keyType.pattern && !keyType.format;
          if (!isTrivialStringKey) schema.propertyNames = keyType;
        }
        return schema;
      }
      // Missing the value type — `Record<K>` is a TS error, but avoid emitting an
      // over-specific additionalProperties: true silently.
      logger.debug(
        `Record<...> used with ${node.typeParameters?.params.length ?? 0} type parameters; expected 2`,
      );
      return { type: "object", additionalProperties: true };
    }

    // When the original type name is hidden behind an `@id` alias and the
    // aliased schema has already been resolved, emit a `$ref` to the alias
    // instead of falling through to `resolveUtilityTypeReference` which would
    // inline the type. This preserves cross-type references like
    // `type Response = { audio: AudioInterface }` when `AudioInterface`
    // carries an `@id Audio` override.
    if (
      (!node.typeParameters || node.typeParameters.params.length === 0) &&
      host.schemaIdAliases[typeName] &&
      host.openapiDefinitions[host.schemaIdAliases[typeName]]
    ) {
      return { $ref: `#/components/schemas/${host.schemaIdAliases[typeName]}` };
    }

    const utilityType = resolveUtilityTypeReference(node, {
      currentFilePath: host.currentFilePath,
      contentType: host.contentType,
      importMap: host.importMap,
      typeDefinitions: host.typeDefinitions,
      fileAccess: host.fileAccess,
      symbolResolver: host.symbolResolver,
      resolveImportPath: (importPath, fromFilePath) =>
        host.resolveImportPath(importPath, fromFilePath),
      resolveTSNodeType: (currentNode) => resolveTypeNodeSchema(host, currentNode),
      findSchemaDefinition: (schemaName, contentType) =>
        host.findSchemaDefinition(schemaName, contentType),
      collectImports: (ast, filePath) => host.collectImports(ast, filePath),
      collectTypeDefinitions: (ast, schemaName, filePath) =>
        host.collectTypeDefinitions(ast, schemaName, filePath),
      collectAllExportedDefinitions: (ast, filePath) =>
        host.collectAllExportedDefinitions(ast, filePath),
      extractFunctionReturnType: (funcNode) => extractFunctionReturnType(funcNode),
      extractFunctionParameters: (funcNode) => extractFunctionParameters(funcNode),
      extractKeysFromLiteralType: (currentNode) => extractKeysFromLiteralType(currentNode),
      resolveGenericType: (definition, params, currentTypeName) =>
        host.resolveGenericType(definition, params, currentTypeName),
      processingTypes: host.processingTypes,
      findTypeDefinition: (schemaName) => {
        host.findSchemaDefinition(schemaName, host.contentType);
      },
      resolveType: (schemaName) => host.resolveType(schemaName),
      setResolvingPickOmitBase: (value) => {
        host.isResolvingPickOmitBase = value;
      },
    });
    if (utilityType) {
      return utilityType;
    }
  }

  if (t.isTSArrayType(node)) {
    return {
      type: "array",
      items: resolveTypeNodeSchema(host, node.elementType),
    };
  }

  if (t.isTSTupleType(node)) {
    // Walk tuple members, unwrapping `TSNamedTupleMember` and handling a trailing
    // `TSRestType` by turning it into an unbounded `items` schema.
    const prefixItems: OpenAPIDefinition[] = [];
    let restItems: OpenAPIDefinition | null = null;
    let minItems = 0;
    for (const element of node.elementTypes) {
      const unwrapped = t.isTSNamedTupleMember(element) ? element.elementType : element;
      if (t.isTSRestType(unwrapped)) {
        const inner = unwrapped.typeAnnotation;
        restItems = t.isTSArrayType(inner)
          ? resolveTypeNodeSchema(host, inner.elementType)
          : resolveTypeNodeSchema(host, inner);
        break;
      }
      const optional =
        (t.isTSNamedTupleMember(element) && element.optional) || t.isTSOptionalType(unwrapped);
      const actualNode = t.isTSOptionalType(unwrapped) ? unwrapped.typeAnnotation : unwrapped;
      prefixItems.push(resolveTypeNodeSchema(host, actualNode));
      if (!optional) minItems++;
    }
    if (restItems !== null) {
      return {
        type: "array",
        ...(prefixItems.length > 0 ? { prefixItems } : {}),
        items: restItems,
        minItems: prefixItems.length - (prefixItems.length - minItems),
      };
    }
    return {
      type: "array",
      prefixItems,
      items: false,
      minItems,
      maxItems: prefixItems.length,
    };
  }

  if (t.isTSFunctionType(node) || t.isTSConstructorType(node)) {
    // Functions / constructors are not transportable — describe as empty schema.
    return {};
  }

  if (t.isTSTypeLiteral(node)) {
    const properties: Record<string, any> = {};
    const required: string[] = [];
    let additionalProperties: OpenAPIDefinition | boolean | undefined;
    node.members.forEach((member: any) => {
      if (t.isTSPropertySignature(member)) {
        const key = member.key;
        const propName = t.isIdentifier(key) ? key.name : t.isStringLiteral(key) ? key.value : null;
        if (!propName) return;
        const property = {
          ...resolveTypeNodeSchema(host, member.typeAnnotation?.typeAnnotation),
          ...getPropertyOptions(member, host.contentType),
        };
        // `readonly foo: string` — surface it in the emitted schema.
        if (member.readonly === true) property.readOnly = true;
        // Allow property-level `@openapi-override { ... }` JSDoc to merge raw OpenAPI into
        // the resolved schema — the explicit escape hatch for anything we can't infer.
        applyPropertyOpenApiOverride(member, property);
        properties[propName] = property;
        if (!member.optional) {
          required.push(propName);
        }
        return;
      }
      if (t.isTSIndexSignature(member)) {
        // `{ [key: string]: Value }` — describe as additionalProperties.
        const valueType = member.typeAnnotation?.typeAnnotation
          ? resolveTypeNodeSchema(host, member.typeAnnotation.typeAnnotation)
          : true;
        additionalProperties = valueType as OpenAPIDefinition | boolean;
      }
    });
    const result: OpenAPIDefinition = { type: "object", properties };
    if (required.length > 0) result.required = required;
    if (additionalProperties !== undefined) result.additionalProperties = additionalProperties;
    return result;
  }

  if (t.isTSUnionType(node)) {
    // Split null/undefined/void "nullable" markers from the real members so we
    // can attach `nullable: true` to whatever shape we emit below.
    const isNullish = (type: any) =>
      t.isTSNullKeyword(type) || t.isTSUndefinedKeyword(type) || t.isTSVoidKeyword(type);
    const nullable = node.types.some((type: any) => t.isTSNullKeyword(type));
    const nonNullableTypes = node.types.filter((type: any) => !isNullish(type));

    // Collapse homogeneous literal unions into `{ type, enum }` — this works
    // even when the original union mixes in `null`/`undefined` thanks to the
    // filtering above.
    const allLiterals =
      nonNullableTypes.length > 0 && nonNullableTypes.every((type: any) => t.isTSLiteralType(type));
    if (allLiterals) {
      const enumValues = nonNullableTypes
        .map((type: any) => {
          if (t.isTSLiteralType(type)) {
            const literal = type.literal;
            if (t.isStringLiteral(literal)) return literal.value;
            if (t.isNumericLiteral(literal)) return literal.value;
            if (t.isBooleanLiteral(literal)) return literal.value;
          }
          return null;
        })
        .filter((value: any) => value !== null);
      if (enumValues.length > 0) {
        const firstType = typeof enumValues[0];
        const sameType = enumValues.every((val: any) => typeof val === firstType);
        if (sameType) {
          const out: OpenAPIDefinition = { type: firstType, enum: enumValues };
          if (nullable) out.nullable = true;
          return out;
        }
      }
    }

    // Single non-nullable member + nullable marker → `{ ...member, nullable: true }`.
    if (nullable && nonNullableTypes.length === 1) {
      const mainType = resolveTypeNodeSchema(host, nonNullableTypes[0]);
      return { ...mainType, nullable: true };
    }

    // Single non-nullable member, nullish marker was `undefined`/`void` → pass through.
    if (!nullable && nonNullableTypes.length === 1) {
      return resolveTypeNodeSchema(host, nonNullableTypes[0]);
    }

    // Fallback: standard oneOf, skipping null/undefined/void members.
    const oneOf = nonNullableTypes.map((subNode: any) => resolveTypeNodeSchema(host, subNode));
    const out: OpenAPIDefinition = { oneOf };
    if (nullable) out.nullable = true;
    return out;
  }

  if (t.isTSIntersectionType(node)) {
    const primitiveMember = node.types
      .map((typeNode: any) => resolveTypeNodeSchema(host, typeNode))
      .find((schema) => schema.type && schema.type !== "object");
    const objectMembers = node.types
      .map((typeNode: any) => resolveTypeNodeSchema(host, typeNode))
      .filter((schema) => schema.type === "object" && schema.properties);
    const hasOnlyBrandObjects =
      objectMembers.length > 0 &&
      objectMembers.every((schema) =>
        Object.keys(schema.properties ?? {}).every((key) => key === "__brand" || key === "brand"),
      );
    if (primitiveMember && hasOnlyBrandObjects) {
      return primitiveMember;
    }

    // For intersection types, we combine properties
    const allProperties: Record<string, any> = {};
    const requiredProperties: string[] = [];

    node.types.forEach((typeNode: any) => {
      const resolvedType = resolveTypeNodeSchema(host, typeNode);
      if (resolvedType.type === "object" && resolvedType.properties) {
        Object.entries(resolvedType.properties).forEach(([key, value]) => {
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

  // Case where a type is a reference to another defined type
  if (t.isTSTypeReference(node) && t.isIdentifier(node.typeName)) {
    const refName = node.typeName.name;
    const aliasedName = host.schemaIdAliases[refName] ?? refName;
    return { $ref: `#/components/schemas/${aliasedName}` };
  }

  logger.debug("Unrecognized TypeScript type node:", node);
  host.addTypeResolutionFallbackDiagnostic(
    "Unrecognized TypeScript type node; emitting object schema.",
    {
      nodeType: node.type,
      suggestedFix: "Use an exported named interface/type or add an explicit schema annotation.",
    },
  );
  return { type: "object" }; // By default we return an object
}
