import * as t from "@babel/types";

import type { OpenApiSchema } from "../../shared/types.js";

// Broader detection for binary payloads passed to `z.custom<T>()`: matches common runtime
// types people annotate uploaded bytes with. We treat them all as `string` + `format: binary`
// so multipart/binary routes get useful schemas without manual overrides.
const BINARY_CUSTOM_TYPES = new Set([
  "File",
  "Blob",
  "Buffer",
  "ArrayBuffer",
  "Uint8Array",
  "ReadableStream",
]);

type ProcessableZodNode = t.Expression | t.SpreadElement;
type ProcessZodNode = (node: ProcessableZodNode) => OpenApiSchema;
export type PrimitiveHelperContext = {
  processNode: ProcessZodNode;
  processObject: (node: t.CallExpression) => OpenApiSchema;
  ensureSchema: (schemaName: string) => void;
  getReferenceSchema: (schemaName: string) => OpenApiSchema;
  resolveEnumValues?: (name: string) => (string | number)[] | null;
  /** Resolve an identifier referring to a simple `const x = ...` literal. */
  resolveLiteralValue?: (name: string) => string | number | boolean | null | undefined;
  /** Resolve an identifier referring to a `const x = [..] as const` literal array. */
  resolveConstArrayValues?: (name: string) => (string | number)[] | null;
  /** Resolve an identifier referring to a `z.object({...})` (or equivalent) call. */
  resolveObjectSchemaNode?: (name: string) => t.CallExpression | null;
  /** The name of the local zod import binding — defaults to `"z"`. */
  zodLocalName?: string;
};

function isProcessableZodNode(
  node:
    | t.ArrayExpression["elements"][number]
    | t.CallExpression["arguments"][number]
    | null
    | undefined,
): node is ProcessableZodNode {
  return !!node && !t.isArgumentPlaceholder(node);
}

export function processZodLiteral(
  node: t.CallExpression,
  context?: PrimitiveHelperContext,
): OpenApiSchema {
  if (node.arguments.length === 0) {
    return { type: "string" };
  }

  const arg = node.arguments[0];

  if (t.isStringLiteral(arg)) {
    return { type: "string", enum: [arg.value] };
  }
  if (t.isNumericLiteral(arg)) {
    return { type: "number", enum: [arg.value] };
  }
  if (t.isBooleanLiteral(arg)) {
    return { type: "boolean", enum: [arg.value] };
  }
  if (t.isNullLiteral(arg)) {
    return { type: "null", enum: [null] };
  }
  // Unwrap `as const` / `satisfies` wrappers
  if (t.isTSAsExpression(arg) || t.isTSSatisfiesExpression(arg)) {
    return processZodLiteral(
      { ...node, arguments: [arg.expression, ...node.arguments.slice(1)] } as t.CallExpression,
      context,
    );
  }
  if (t.isIdentifier(arg) && context?.resolveLiteralValue) {
    const value = context.resolveLiteralValue(arg.name);
    if (typeof value === "string") return { type: "string", enum: [value] };
    if (typeof value === "number") return { type: "number", enum: [value] };
    if (typeof value === "boolean") return { type: "boolean", enum: [value] };
    if (value === null) return { type: "null", enum: [null] };
  }

  return { type: "string" };
}

/**
 * Resolve the `[ ... ]` array of schemas for `z.union([...])`, `z.discriminatedUnion(x, [...])`
 * or `z.tuple([...])`. Unwraps `as const` / `satisfies` wrappers. Identifier-to-literal-array
 * resolution is handled separately by the callers via `resolveConstArrayValues` so enums
 * can be emitted instead of `oneOf`.
 */
function resolveArrayOfSchemas(arg: t.Node | null | undefined): t.ArrayExpression | null {
  if (!arg) return null;
  if (t.isArrayExpression(arg)) return arg;
  if (t.isTSAsExpression(arg) || t.isTSSatisfiesExpression(arg)) {
    return resolveArrayOfSchemas(arg.expression);
  }
  return null;
}

export function processZodDiscriminatedUnion(
  node: t.CallExpression,
  processNode: ProcessZodNode,
  context?: PrimitiveHelperContext,
): OpenApiSchema {
  if (node.arguments.length < 2) {
    return { type: "object" };
  }

  let discriminator = "";
  const first = node.arguments[0];
  if (t.isStringLiteral(first)) {
    discriminator = first.value;
  } else if (t.isIdentifier(first) && context?.resolveLiteralValue) {
    const val = context.resolveLiteralValue(first.name);
    if (typeof val === "string") discriminator = val;
  }

  const schemasArray = resolveArrayOfSchemas(node.arguments[1]);
  if (!schemasArray) {
    return { type: "object" };
  }

  const schemas = schemasArray.elements
    .filter(isProcessableZodNode)
    .map((element) => processNode(element));

  if (schemas.length === 0) {
    return { type: "object" };
  }

  if (!discriminator) {
    return {
      type: "object",
      oneOf: schemas,
    };
  }

  // Build a discriminator.mapping by extracting each variant's literal discriminator value
  // from its `properties[discriminator].enum`. When the variant is emitted as `$ref`, point
  // the mapping entry at the ref; otherwise skip (inline schemas don't round-trip via mapping).
  const mapping: Record<string, string> = {};
  for (const variant of schemas) {
    const variantRef = extractRefFromSchema(variant);
    if (!variantRef) continue;
    const literal = extractDiscriminatorLiteral(variant, discriminator);
    if (typeof literal === "string") {
      mapping[literal] = variantRef;
    }
  }

  const discriminatorObj: { propertyName: string; mapping?: Record<string, string> } = {
    propertyName: discriminator,
  };
  if (Object.keys(mapping).length > 0) {
    discriminatorObj.mapping = mapping;
  }

  return {
    type: "object",
    discriminator: discriminatorObj,
    oneOf: schemas,
  };
}

function extractRefFromSchema(schema: OpenApiSchema): string | undefined {
  const maybeRef = (schema as { $ref?: string }).$ref;
  if (typeof maybeRef === "string") {
    return maybeRef;
  }
  const allOf = (schema as { allOf?: Array<{ $ref?: string }> }).allOf;
  if (Array.isArray(allOf) && allOf.length === 1 && typeof allOf[0]?.$ref === "string") {
    return allOf[0].$ref;
  }
  return undefined;
}

function extractDiscriminatorLiteral(
  schema: OpenApiSchema,
  propertyName: string,
): string | undefined {
  const properties = (schema as { properties?: Record<string, { enum?: unknown[] }> }).properties;
  const enumValues = properties?.[propertyName]?.enum;
  if (Array.isArray(enumValues) && enumValues.length === 1 && typeof enumValues[0] === "string") {
    return enumValues[0];
  }
  return undefined;
}

export function processZodTuple(
  node: t.CallExpression,
  processNode: ProcessZodNode,
  context?: PrimitiveHelperContext,
): OpenApiSchema {
  if (node.arguments.length === 0) {
    return { type: "array", items: { type: "string" } };
  }

  const arrayExpr = resolveArrayOfSchemas(node.arguments[0]);
  if (!arrayExpr) {
    // Identifier pointing at a literal tuple: `const Pair = ["a", 1] as const`.
    if (t.isIdentifier(node.arguments[0]) && context?.resolveConstArrayValues) {
      const values = context.resolveConstArrayValues(node.arguments[0].name);
      if (values && values.length > 0) {
        const prefixItems: OpenApiSchema[] = values.map((value) =>
          typeof value === "number"
            ? { type: "number", enum: [value] }
            : { type: "string", enum: [value] },
        );
        return {
          type: "array",
          prefixItems,
          items: false,
          minItems: prefixItems.length,
          maxItems: prefixItems.length,
        };
      }
    }
    return { type: "array", items: { type: "string" } };
  }

  const tupleItems = arrayExpr.elements
    .filter(isProcessableZodNode)
    .map((element) => processNode(element));

  return {
    type: "array",
    prefixItems: tupleItems,
    items: false,
    ...(tupleItems.length > 0
      ? {
          minItems: tupleItems.length,
          maxItems: tupleItems.length,
        }
      : {}),
  };
}

export function processZodIntersection(
  node: t.CallExpression,
  processNode: ProcessZodNode,
): OpenApiSchema {
  if (node.arguments.length < 2) {
    return { type: "object" };
  }

  const [firstArgument, secondArgument] = node.arguments;
  if (!isProcessableZodNode(firstArgument) || !isProcessableZodNode(secondArgument)) {
    return { type: "object" };
  }

  return {
    allOf: [processNode(firstArgument), processNode(secondArgument)],
  };
}

export function processZodUnion(
  node: t.CallExpression,
  processNode: ProcessZodNode,
  context?: PrimitiveHelperContext,
): OpenApiSchema {
  if (node.arguments.length === 0) {
    return { type: "object" };
  }

  const arrayExpr = resolveArrayOfSchemas(node.arguments[0]);
  if (!arrayExpr) {
    // Identifier resolving to a literal-only array becomes an `enum`.
    if (t.isIdentifier(node.arguments[0]) && context?.resolveConstArrayValues) {
      const values = context.resolveConstArrayValues(node.arguments[0].name);
      if (values && values.length > 0) {
        const type = typeof values[0] === "number" ? "number" : "string";
        return { type, enum: values };
      }
    }
    return { type: "object" };
  }

  const unionItems = arrayExpr.elements
    .filter(isProcessableZodNode)
    .map((element) => processNode(element));

  if (unionItems.length === 2) {
    const isNullable = unionItems.some(
      (item) =>
        item.type === "null" || (item.enum && item.enum.length === 1 && item.enum[0] === null),
    );

    if (isNullable) {
      const nonNullItem = unionItems.find(
        (item) =>
          item.type !== "null" && !(item.enum && item.enum.length === 1 && item.enum[0] === null),
      );

      if (nonNullItem) {
        return {
          ...nonNullItem,
          nullable: true,
        };
      }
    }
  }

  const firstUnionItem = unionItems[0];
  const allSameType =
    !!firstUnionItem && unionItems.every((item) => item.type === firstUnionItem.type && item.enum);

  if (allSameType) {
    return {
      type: firstUnionItem.type,
      enum: unionItems.flatMap((item) => item.enum || []),
    };
  }

  return {
    oneOf: unionItems,
  };
}

export function extractDescriptionFromArguments(node: t.CallExpression): string | null {
  if (
    t.isMemberExpression(node.callee) &&
    t.isIdentifier(node.callee.property) &&
    node.callee.property.name === "describe" &&
    node.arguments.length > 0 &&
    t.isStringLiteral(node.arguments[0])
  ) {
    return node.arguments[0].value;
  }

  if (t.isMemberExpression(node.callee) && t.isCallExpression(node.callee.object)) {
    return extractDescriptionFromArguments(node.callee.object);
  }

  return null;
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function hasOptionalMethod(node: t.CallExpression): boolean {
  if (!t.isCallExpression(node)) {
    return false;
  }

  if (
    t.isMemberExpression(node.callee) &&
    t.isIdentifier(node.callee.property) &&
    (node.callee.property.name === "optional" || node.callee.property.name === "nullish")
  ) {
    return true;
  }

  if (t.isMemberExpression(node.callee) && t.isCallExpression(node.callee.object)) {
    return hasOptionalMethod(node.callee.object);
  }

  return false;
}

export function isOptionalCall(node: t.CallExpression): boolean {
  if (
    t.isCallExpression(node) &&
    t.isMemberExpression(node.callee) &&
    t.isIdentifier(node.callee.property) &&
    node.callee.property.name === "optional"
  ) {
    return true;
  }

  if (
    t.isCallExpression(node) &&
    t.isMemberExpression(node.callee) &&
    t.isCallExpression(node.callee.object)
  ) {
    return hasOptionalMethod(node);
  }

  return false;
}

function getZodCalleePath(node: t.CallExpression, zodLocalName: string = "z"): string[] | null {
  if (!t.isMemberExpression(node.callee) || !t.isIdentifier(node.callee.property)) {
    return null;
  }

  const path = [node.callee.property.name];
  let currentObject: t.Node = node.callee.object;

  while (t.isMemberExpression(currentObject)) {
    if (!t.isIdentifier(currentObject.property)) {
      return null;
    }

    path.unshift(currentObject.property.name);
    currentObject = currentObject.object;
  }

  if (!t.isIdentifier(currentObject, { name: zodLocalName })) {
    return null;
  }

  return path;
}

export function processZodPrimitiveNode(
  node: t.CallExpression,
  context: PrimitiveHelperContext,
): OpenApiSchema {
  if (t.isMemberExpression(node.callee) && t.isCallExpression(node.callee.object)) {
    const schema = processZodPrimitiveNode(node.callee.object, context);
    const description = extractDescriptionFromArguments(node);
    if (description) {
      schema.description = description;
    }
    return schema;
  }

  const zodCalleePath = getZodCalleePath(node, context.zodLocalName);
  if (!zodCalleePath) {
    return { type: "string" };
  }

  const zodType = zodCalleePath.join(".");
  let schema: OpenApiSchema = {};

  switch (zodType) {
    case "string":
      schema = { type: "string" };
      break;
    case "number":
      schema = { type: "number" };
      break;
    case "boolean":
    case "stringbool":
      schema = { type: "boolean" };
      break;
    case "date":
      schema = { type: "string", format: "date-time" };
      break;
    case "bigint":
      schema = { type: "integer", format: "int64" };
      break;
    case "email":
      schema = { type: "string", format: "email" };
      break;
    case "url":
    case "uri":
      schema = { type: "string", format: "uri" };
      break;
    case "uuid":
    case "guid":
      schema = { type: "string", format: "uuid" };
      break;
    case "cuid":
      schema = { type: "string", format: "cuid" };
      break;
    case "cuid2":
      schema = { type: "string", format: "cuid2" };
      break;
    case "ulid":
      schema = { type: "string", format: "ulid" };
      break;
    case "nanoid":
      schema = { type: "string", format: "nanoid" };
      break;
    case "jwt":
      schema = { type: "string", format: "jwt" };
      break;
    case "base64":
      schema = { type: "string", format: "byte" };
      break;
    case "base64url":
      schema = { type: "string", format: "base64url" };
      break;
    case "emoji":
      // Matches Zod's `RegExp` for an emoji grapheme cluster.
      schema = { type: "string", format: "emoji" };
      break;
    case "ip":
      schema = { type: "string", format: "ip" };
      break;
    case "cidr":
      schema = { type: "string", format: "cidr" };
      break;
    case "cidrv4":
      schema = { type: "string", format: "cidrv4" };
      break;
    case "cidrv6":
      schema = { type: "string", format: "cidrv6" };
      break;
    case "e164":
      schema = { type: "string", format: "e164" };
      break;
    case "datetime":
      schema = { type: "string", format: "date-time" };
      break;
    case "time":
      schema = { type: "string", format: "time" };
      break;
    case "iso.datetime":
      schema = { type: "string", format: "date-time" };
      break;
    case "iso.date":
      schema = { type: "string", format: "date" };
      break;
    case "iso.time":
      schema = { type: "string", format: "time" };
      break;
    case "iso.duration":
      schema = { type: "string", format: "duration" };
      break;
    case "ipv4":
      schema = { type: "string", format: "ipv4" };
      break;
    case "ipv6":
      schema = { type: "string", format: "ipv6" };
      break;
    case "any":
    case "unknown":
      // Truly any / unknown — an empty schema accepts anything. Emit {} rather than
      // `{ type: "object" }` so we don't pin the type for free-form values.
      schema = {};
      break;
    case "null":
    case "undefined":
      schema = { type: "null" };
      break;
    case "void":
      // Zod's `z.void()` ≈ `undefined`; callers that downgrade to OAS 3.0 will
      // normalize this to `{ not: {} }` or drop it.
      schema = { type: "null" };
      break;
    case "never":
      // `never` — no value is valid. JSON Schema: `{ not: {} }`.
      schema = { not: {} };
      break;
    case "nan":
      schema = { type: "number" };
      break;
    case "file":
      schema = { type: "string", format: "binary" };
      break;
    case "instanceof": {
      // Map known host objects to their canonical wire representation.
      //  - File/Blob → base64/binary upload
      //  - Date      → RFC 3339 date-time string
      //  - RegExp/URL/URLSearchParams → plain string
      const firstArg = node.arguments[0];
      if (firstArg && t.isIdentifier(firstArg)) {
        switch (firstArg.name) {
          case "File":
          case "Blob":
            schema = { type: "string", format: "binary" };
            break;
          case "Date":
            schema = { type: "string", format: "date-time" };
            break;
          case "RegExp":
          case "URL":
          case "URLSearchParams":
            schema = { type: "string" };
            break;
          default:
            schema = {};
        }
      } else {
        schema = {};
      }
      break;
    }
    case "promise": {
      // `z.promise(T)` is represented as `T` for wire-level OpenAPI (promises aren't
      // transmittable, but we describe the resolved value).
      if (node.arguments.length > 0 && isProcessableZodNode(node.arguments[0])) {
        schema = context.processNode(node.arguments[0]);
      } else {
        schema = {};
      }
      break;
    }
    case "function":
      // Functions can't be transported over the wire; emit an empty schema.
      schema = {};
      break;
    case "preprocess":
    case "pipeline": {
      // `z.preprocess(fn, schema)` & `z.pipeline(a, b)` — describe the target schema.
      const targetIndex = zodType === "preprocess" ? 1 : node.arguments.length - 1;
      const target = node.arguments[targetIndex];
      if (target && isProcessableZodNode(target)) {
        schema = context.processNode(target);
      } else {
        schema = {};
      }
      break;
    }
    case "lazy": {
      // `z.lazy(() => Schema)` — unwrap the body expression so the reference is followed.
      const arrow = node.arguments[0];
      if (arrow && (t.isArrowFunctionExpression(arrow) || t.isFunctionExpression(arrow))) {
        const body = arrow.body;
        if (t.isExpression(body) && isProcessableZodNode(body)) {
          schema = context.processNode(body);
        } else {
          schema = {};
        }
      } else {
        schema = {};
      }
      break;
    }
    case "array": {
      if (node.arguments.length === 0) {
        schema = { type: "array" };
        break;
      }
      let itemsType: OpenApiSchema = { type: "string" };
      const firstArgument = node.arguments[0];
      if (t.isIdentifier(firstArgument)) {
        const schemaName = firstArgument.name;
        context.ensureSchema(schemaName);
        itemsType = context.getReferenceSchema(schemaName);
      } else if (isProcessableZodNode(firstArgument)) {
        itemsType = context.processNode(firstArgument);
      }
      schema = { type: "array", items: itemsType };
      break;
    }
    case "nativeEnum":
    case "enum":
      if (node.arguments.length > 0 && t.isArrayExpression(node.arguments[0])) {
        const enumValues = node.arguments[0].elements
          .filter((el) => t.isStringLiteral(el) || t.isNumericLiteral(el))
          // @ts-ignore
          .map((el) => el.value);
        const firstValue = enumValues[0];
        const valueType = typeof firstValue;

        schema = {
          type: valueType === "number" ? "number" : "string",
          enum: enumValues,
        };
      } else if (node.arguments.length > 0 && t.isObjectExpression(node.arguments[0])) {
        const enumValues: string[] = [];
        node.arguments[0].properties.forEach((prop) => {
          if (t.isObjectProperty(prop) && t.isStringLiteral(prop.value)) {
            enumValues.push(prop.value.value);
          }
        });
        schema =
          enumValues.length > 0
            ? {
                type: "string",
                enum: enumValues,
              }
            : { type: "string" };
      } else if (
        node.arguments.length > 0 &&
        t.isIdentifier(node.arguments[0]) &&
        context.resolveEnumValues
      ) {
        const resolved = context.resolveEnumValues(node.arguments[0].name);
        if (resolved && resolved.length > 0) {
          const valueType = typeof resolved[0] === "number" ? "number" : "string";
          schema = { type: valueType, enum: resolved };
        } else {
          schema = { type: "string" };
        }
      } else {
        schema = { type: "string" };
      }
      break;
    case "record": {
      // Zod 4: `z.record(keyType, valueType)` — keep propertyNames + additionalProperties.
      // Zod 3 / single-arg form: `z.record(valueType)`.
      let valueType: OpenApiSchema = { type: "string" };
      let propertyNames: OpenApiSchema | undefined;
      if (node.arguments.length >= 2) {
        const keyArg = node.arguments[0];
        const valueArg = node.arguments[1];
        if (isProcessableZodNode(keyArg)) propertyNames = context.processNode(keyArg);
        if (isProcessableZodNode(valueArg)) valueType = context.processNode(valueArg);
      } else if (node.arguments.length === 1) {
        const firstArgument = node.arguments[0];
        if (isProcessableZodNode(firstArgument)) valueType = context.processNode(firstArgument);
      }
      schema = {
        type: "object",
        additionalProperties: valueType,
        ...(propertyNames ? { propertyNames } : {}),
      };
      break;
    }
    case "map": {
      // Zod 4: `z.map(keyType, valueType)` → object with additionalProperties (and optional
      // propertyNames) so typed maps do not fall back to `additionalProperties: true`.
      let mapValueType: OpenApiSchema | true = true;
      let mapKeyType: OpenApiSchema | undefined;
      if (node.arguments.length >= 2) {
        const keyArg = node.arguments[0];
        const valueArg = node.arguments[1];
        if (isProcessableZodNode(keyArg)) mapKeyType = context.processNode(keyArg);
        if (isProcessableZodNode(valueArg)) mapValueType = context.processNode(valueArg);
      } else if (node.arguments.length === 1) {
        const firstArgument = node.arguments[0];
        if (isProcessableZodNode(firstArgument)) mapValueType = context.processNode(firstArgument);
      }
      schema = {
        type: "object",
        additionalProperties: mapValueType,
        ...(mapKeyType ? { propertyNames: mapKeyType } : {}),
      };
      break;
    }
    case "set": {
      let setItemType: OpenApiSchema = { type: "string" };
      if (node.arguments.length > 0) {
        const firstArgument = node.arguments[0];
        if (isProcessableZodNode(firstArgument)) {
          setItemType = context.processNode(firstArgument);
        }
      }
      schema = {
        type: "array",
        items: setItemType,
        uniqueItems: true,
      };
      break;
    }
    case "object":
      schema = node.arguments.length > 0 ? context.processObject(node) : { type: "object" };
      break;
    case "templateLiteral":
      schema = { type: "string" };
      break;
    case "custom":
      if (node.typeParameters && node.typeParameters.params.length > 0) {
        const typeParam = node.typeParameters.params[0];
        if (
          t.isTSTypeReference(typeParam) &&
          t.isIdentifier(typeParam.typeName) &&
          BINARY_CUSTOM_TYPES.has(typeParam.typeName.name)
        ) {
          schema = { type: "string", format: "binary" };
        } else {
          schema = { type: "string" };
        }
      } else if (node.arguments.length > 0 && t.isArrowFunctionExpression(node.arguments[0])) {
        schema = {
          type: "object",
          additionalProperties: true,
        };
      } else {
        schema = { type: "string" };
      }
      break;
    default:
      schema = { type: "string" };
      break;
  }

  const description = extractDescriptionFromArguments(node);
  if (description) {
    schema.description = description;
  }

  return schema;
}
