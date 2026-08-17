import * as t from "@babel/types";

import type { OpenApiSchema } from "../../shared/types.js";
import { applyNullableWrapper } from "./nullability.js";
import { applyZodStringFormat } from "./string-formats.js";

export type ZodChainHost = {
  applyDeepPartial: (schema: OpenApiSchema) => void;
  applyFunctionalCheckArg: (schema: OpenApiSchema, arg: t.CallExpression) => OpenApiSchema;
  currentFilePath: string;
  diagnostics?: {
    add: (diagnostic: {
      code: string;
      severity: string;
      message: string;
      filePath?: string;
      metadata?: Record<string, unknown>;
    }) => void;
  };
  escapeRegExp: (value: string) => string;
  extractMaskKeysFromNode: (node: t.Node | null | undefined) => string[];
  extractStaticJsonValue: (node: t.Node | null | undefined) => unknown;
  mergeExtendedObject: (base: OpenApiSchema, arg: t.Node | undefined) => OpenApiSchema;
  mergePipeSchema: (schema: OpenApiSchema, piped: OpenApiSchema) => OpenApiSchema;
  processZodNode: (node: t.Node) => OpenApiSchema;
  resolveLiteralValue: (name: string) => unknown;
  resolveNumericArg: (node: t.Node | undefined) => number | undefined;
  resolveStringArg: (node: t.Node | undefined) => string | undefined;
  resolveStringArrayArg: (node: t.Node | undefined) => string[] | undefined;
  unwrapTypeAssertion: (node: t.Node | undefined) => t.Node;
  warnIfUnknownZodMethod: (methodName: string) => void;
};

export function applyZodChainMethod(
  converter: ZodChainHost,
  schema: OpenApiSchema,
  methodName: string,
  node: t.CallExpression,
): OpenApiSchema {
  switch (methodName) {
    case "optional":
      // optional means T | undefined — not in required array, no nullable flag
      // Required array exclusion is handled by hasOptionalMethod() in processZodObject()
      break;
    case "nullable":
      // nullable means T | null — field stays required but can be null
      schema = applyNullableWrapper(schema);
      break;
    case "nullish": // T | null | undefined
      // Not in required array (handled by hasOptionalMethod) AND can be null
      schema = applyNullableWrapper(schema);
      break;
    case "describe": {
      const descVal = converter.resolveStringArg(node.arguments[0]);
      if (descVal !== undefined) {
        // Check if description includes @deprecated
        if (descVal.startsWith("@deprecated")) {
          schema.deprecated = true;
          // Remove @deprecated from description
          schema.description = descVal.replace("@deprecated", "").trim();
        } else {
          schema.description = descVal;
        }
      }
      break;
    }
    case "deprecated":
      schema.deprecated = true;
      break;
    case "min": {
      const minVal = converter.resolveNumericArg(node.arguments[0]);
      if (minVal !== undefined) {
        if (schema.type === "string") {
          schema.minLength = minVal;
        } else if (schema.type === "number" || schema.type === "integer") {
          schema.minimum = minVal;
        } else if (schema.type === "array") {
          schema.minItems = minVal;
        }
      }
      break;
    }
    case "max": {
      const maxVal = converter.resolveNumericArg(node.arguments[0]);
      if (maxVal !== undefined) {
        if (schema.type === "string") {
          schema.maxLength = maxVal;
        } else if (schema.type === "number" || schema.type === "integer") {
          schema.maximum = maxVal;
        } else if (schema.type === "array") {
          schema.maxItems = maxVal;
        }
      }
      break;
    }
    case "length": {
      const lenVal = converter.resolveNumericArg(node.arguments[0]);
      if (lenVal !== undefined) {
        if (schema.type === "string") {
          schema.minLength = lenVal;
          schema.maxLength = lenVal;
        } else if (schema.type === "array") {
          schema.minItems = lenVal;
          schema.maxItems = lenVal;
        }
      }
      break;
    }
    case "nonempty":
      // `z.array(...).nonempty()` → at least one item.
      if (schema.type === "array") {
        schema.minItems = Math.max(schema.minItems ?? 0, 1);
      } else if (schema.type === "string") {
        schema.minLength = Math.max(schema.minLength ?? 0, 1);
      }
      break;
    case "rest":
      // `z.tuple([...]).rest(schema)` — tuple is now open-ended. Drop the
      // fixed `maxItems` and set a rest-items schema for downstream consumers.
      if (schema.type === "array") {
        delete schema.maxItems;
        const firstArgument = node.arguments[0];
        if (firstArgument && !t.isArgumentPlaceholder(firstArgument)) {
          const restSchema = converter.processZodNode(firstArgument);
          if (restSchema) {
            // Only set `items` when the tuple used `prefixItems`; otherwise
            // `items` is already the tuple element schema and must not be
            // overwritten.
            const hasPrefixItems = Array.isArray(
              (schema as { prefixItems?: unknown[] }).prefixItems,
            );
            if (hasPrefixItems) schema.items = restSchema;
          }
        }
      }
      break;
    case "email":
    case "url":
    case "uri":
    case "uuid":
    case "uuidv4":
    case "uuidv6":
    case "uuidv7":
    case "guid":
    case "cuid":
    case "cuid2":
    case "ulid":
    case "nanoid":
    case "jwt":
    case "xid":
    case "ksuid":
    case "hostname":
    case "hex":
    case "hash":
    case "base64":
    case "base64url":
    case "emoji":
    case "ip":
    case "cidr":
    case "cidrv4":
    case "cidrv6":
    case "e164":
    case "ipv4":
    case "ipv6":
    case "duration":
    case "iso.duration":
    case "httpUrl":
    case "datetime":
    case "date":
    case "time":
      schema = applyZodStringFormat(schema, methodName, (formatName) => {
        converter.diagnostics?.add({
          code: "unregistered-format",
          severity: "info",
          message: `Zod format "${formatName}" is not in the OAI Format registry; emitting a pattern or registered equivalent instead.`,
          filePath: converter.currentFilePath,
          metadata: { format: formatName },
        });
      });
      break;
    case "regex":
      if (node.arguments.length > 0 && t.isRegExpLiteral(node.arguments[0])) {
        schema.pattern = node.arguments[0].pattern;
      }
      break;
    case "startsWith": {
      const swVal = converter.resolveStringArg(node.arguments[0]);
      if (swVal !== undefined) {
        schema.pattern = `^${converter.escapeRegExp(swVal)}`;
      }
      break;
    }
    case "endsWith": {
      const ewVal = converter.resolveStringArg(node.arguments[0]);
      if (ewVal !== undefined) {
        schema.pattern = `${converter.escapeRegExp(ewVal)}$`;
      }
      break;
    }
    case "includes": {
      const incVal = converter.resolveStringArg(node.arguments[0]);
      if (incVal !== undefined) {
        schema.pattern = converter.escapeRegExp(incVal);
      }
      break;
    }
    case "trim":
    case "toLowerCase":
    case "toUpperCase":
      // String normalization changes runtime values, not the accepted wire shape.
      break;
    case "multipleOf":
    case "step": {
      const multipleOf = converter.resolveNumericArg(node.arguments[0]);
      if (multipleOf !== undefined) {
        schema.multipleOf = multipleOf;
      }
      break;
    }
    case "int":
      schema.type = "integer";
      break;
    case "positive":
      schema.exclusiveMinimum = 0;
      break;
    case "nonnegative":
      schema.minimum = 0;
      break;
    case "negative":
      schema.exclusiveMaximum = 0;
      break;
    case "nonpositive":
      schema.maximum = 0;
      break;
    case "finite":
      // Can't express directly in OpenAPI
      break;
    case "safe":
      // Number is within the IEEE-754 "safe integer" range
      schema.minimum = -9007199254740991; // -(2^53 - 1)
      schema.maximum = 9007199254740991; // 2^53 - 1
      break;
    case "mime": {
      const mimeTypes = node.arguments.flatMap((argument) => {
        const values = converter.resolveStringArrayArg(argument);
        return values ?? [];
      });
      if (mimeTypes.length === 1) {
        schema.contentMediaType = mimeTypes[0];
      } else if (mimeTypes.length > 1) {
        delete schema.contentMediaType;
        schema["x-contentMediaTypes"] = mimeTypes;
      }
      break;
    }
    case "minSize": {
      const minSize = converter.resolveNumericArg(node.arguments[0]);
      if (minSize !== undefined) {
        schema.minLength = minSize;
      }
      break;
    }
    case "maxSize": {
      const maxSize = converter.resolveNumericArg(node.arguments[0]);
      if (maxSize !== undefined) {
        schema.maxLength = maxSize;
      }
      break;
    }
    case "default":
      if (node.arguments.length > 0) {
        const defaultArg = converter.unwrapTypeAssertion(node.arguments[0]);
        if (t.isStringLiteral(defaultArg)) {
          schema.default = defaultArg.value;
        } else if (t.isNumericLiteral(defaultArg)) {
          schema.default = defaultArg.value;
        } else if (t.isBooleanLiteral(defaultArg)) {
          schema.default = defaultArg.value;
        } else if (t.isNullLiteral(defaultArg)) {
          schema.default = null;
        } else if (t.isIdentifier(defaultArg)) {
          const val = converter.resolveLiteralValue(defaultArg.name);
          if (val !== undefined) schema.default = val as OpenApiSchema["default"];
        } else if (t.isObjectExpression(defaultArg)) {
          // Try to create a default object, but this might not be complete
          const defaultObj: Record<string, string | number | boolean> = {};
          defaultArg.properties.forEach((prop) => {
            if (
              t.isObjectProperty(prop) &&
              (t.isIdentifier(prop.key) || t.isStringLiteral(prop.key)) &&
              (t.isStringLiteral(prop.value) ||
                t.isNumericLiteral(prop.value) ||
                t.isBooleanLiteral(prop.value))
            ) {
              const key = t.isIdentifier(prop.key) ? prop.key.name : prop.key.value;
              const value = t.isStringLiteral(prop.value)
                ? prop.value.value
                : t.isNumericLiteral(prop.value)
                  ? prop.value.value
                  : t.isBooleanLiteral(prop.value)
                    ? prop.value.value
                    : null;

              if (key !== null && value !== null) {
                defaultObj[key] = value;
              }
            }
          });

          schema.default = defaultObj;
        }
      }
      break;
    case "prefault":
    case "catch":
      if (typeof schema.default === "undefined" && node.arguments.length > 0) {
        const fallbackValue = converter.extractStaticJsonValue(node.arguments[0]);
        if (typeof fallbackValue !== "undefined") {
          schema.default = fallbackValue as OpenApiSchema["default"];
        }
      }
      break;
    case "meta":
      if (node.arguments.length > 0) {
        const metadata = converter.extractStaticJsonValue(node.arguments[0]);
        if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
          const {
            id: _id,
            title,
            description,
            examples,
            deprecated,
            ...rest
          } = metadata as Record<string, unknown>;
          if (typeof title === "string") {
            schema.title = title;
          }
          if (typeof description === "string") {
            schema.description = description;
          }
          if (Array.isArray(examples)) {
            schema.examples = examples as OpenApiSchema["examples"];
          }
          if (deprecated === true) {
            schema.deprecated = true;
          }
          Object.assign(schema, rest);
        }
      }
      break;
    case "extend":
      if (
        t.isMemberExpression(node.callee) &&
        t.isExpression(node.callee.object) &&
        node.arguments.length > 0 &&
        t.isObjectExpression(node.arguments[0])
      ) {
        const baseSchemaResult = converter.processZodNode(node.callee.object);
        schema = converter.mergeExtendedObject(baseSchemaResult, node.arguments[0]);
      }
      break;
    case "refine":
    case "superRefine":
      break;
    case "check":
      for (const argument of node.arguments) {
        if (t.isCallExpression(argument)) {
          schema = converter.applyFunctionalCheckArg(schema, argument);
        }
      }
      break;
    case "transform":
    case "overwrite":
      // Transform doesn't change the schema validation, only the output format
      break;
    case "nonoptional":
      // Required-ness is tracked on parent object schemas; the value schema is unchanged.
      break;
    case "readonly":
      // `z.readonly()` → JSON Schema `readOnly: true`. Harmless on primitives too.
      schema.readOnly = true;
      break;
    case "brand":
      // `z.brand<"X">()` is a purely compile-time marker in Zod and doesn't affect the
      // wire format. Pass through the schema unchanged.
      break;
    case "passthrough":
    case "catchall":
      // Zod object modes that allow unknown properties. Map to
      // `additionalProperties: true` (or the catchall schema) so consumers can see it.
      if (schema.type === "object") {
        if (methodName === "catchall" && node.arguments.length > 0) {
          const firstArgument = node.arguments[0];
          if (firstArgument && !t.isArgumentPlaceholder(firstArgument)) {
            schema.additionalProperties = converter.processZodNode(firstArgument);
          } else {
            schema.additionalProperties = true;
          }
        } else {
          schema.additionalProperties = true;
        }
      }
      break;
    case "strict":
      // Zod `.strict()` — forbid unknown properties.
      if (schema.type === "object") {
        schema.additionalProperties = false;
      }
      break;
    case "strip":
      // Zod default behavior — strip unknown properties. OpenAPI default
      // (unset `additionalProperties`) already reflects converter.
      break;
    case "deepPartial":
      // Recursively mark all nested object properties as optional.
      converter.applyDeepPartial(schema);
      break;
    case "pick": {
      // `.pick({ a: true, b: true })` — keep only the listed keys.
      const keys = converter.extractMaskKeysFromNode(node.arguments[0]);
      if (keys.length > 0 && schema.type === "object" && schema.properties) {
        const keep = new Set(keys);
        const next: Record<string, OpenApiSchema> = {};
        for (const [key, value] of Object.entries(schema.properties)) {
          if (keep.has(key) && value) next[key] = value;
        }
        schema.properties = next;
        if (schema.required) {
          schema.required = schema.required.filter((key) => keep.has(key));
          if (schema.required.length === 0) schema.required = [];
        }
      }
      break;
    }
    case "omit": {
      // `.omit({ a: true })` / mask identifiers — drop the listed keys.
      const keys = converter.extractMaskKeysFromNode(node.arguments[0]);
      if (keys.length > 0 && schema.type === "object" && schema.properties) {
        for (const key of keys) {
          if (schema.properties[key]) delete schema.properties[key];
        }
        if (schema.required) {
          const omit = new Set(keys);
          schema.required = schema.required.filter((key) => !omit.has(key));
          if (schema.required.length === 0) schema.required = [];
        }
      }
      break;
    }
    case "partial":
      // `.partial()` or `.partial({ a: true })` — mark the listed keys (or all
      // keys) optional by pulling them out of `required`.
      if (schema.type === "object" && schema.properties) {
        const partialKeys = converter.extractMaskKeysFromNode(node.arguments[0]);
        if (partialKeys.length === 0) {
          delete schema.required;
        } else if (schema.required) {
          const drop = new Set(partialKeys);
          schema.required = schema.required.filter((key) => !drop.has(key));
          if (schema.required.length === 0) delete schema.required;
        }
      }
      break;
    case "required":
      // `.required()` — every property becomes required.
      if (schema.type === "object" && schema.properties) {
        schema.required = Object.keys(schema.properties);
      }
      break;
    case "keyof":
      if (schema.type === "object" && schema.properties) {
        schema = {
          type: "string",
          enum: Object.keys(schema.properties),
        };
      }
      break;
    case "merge": {
      // `.merge(OtherObjectSchema)` — inline the other object's properties.
      // In Zod 4 this is equivalent to `.extend(other.shape)`.
      const firstArgument = node.arguments[0];
      if (firstArgument && !t.isArgumentPlaceholder(firstArgument)) {
        const other = converter.processZodNode(firstArgument);
        if (other && other.type === "object" && other.properties) {
          schema.properties = { ...schema.properties, ...other.properties };
          if (other.required && other.required.length > 0) {
            schema.required = Array.from(new Set([...(schema.required ?? []), ...other.required]));
          }
        }
      }
      break;
    }
    case "pipe":
      if (node.arguments.length > 0) {
        const firstArgument = node.arguments[0];
        if (firstArgument && !t.isArgumentPlaceholder(firstArgument)) {
          const pipedSchema = converter.processZodNode(firstArgument);
          schema = converter.mergePipeSchema(schema, pipedSchema);
        }
      }
      break;
    case "or":
      if (node.arguments.length > 0) {
        const firstArgument = node.arguments[0];
        if (!firstArgument) {
          break;
        }
        const alternativeSchema = converter.processZodNode(firstArgument);
        if (alternativeSchema) {
          schema = {
            anyOf: [schema, alternativeSchema],
          };
        }
      }
      break;
    case "and":
      if (node.arguments.length > 0) {
        const firstArgument = node.arguments[0];
        if (!firstArgument) {
          break;
        }
        const additionalSchema = converter.processZodNode(firstArgument);
        if (additionalSchema) {
          schema = {
            allOf: [schema, additionalSchema],
          };
        }
      }
      break;
    default:
      converter.warnIfUnknownZodMethod(methodName);
      break;
  }

  return schema;
}
