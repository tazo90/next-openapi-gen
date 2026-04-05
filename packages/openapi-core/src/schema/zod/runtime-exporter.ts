import * as t from "@babel/types";
import * as z from "zod";

import { logger } from "../../shared/logger.js";
import type { ContentType, JsonValue, OpenApiSchema } from "../../shared/types.js";

type RuntimeExportOptions = {
  contentType: ContentType;
};

export class ZodRuntimeExporter {
  public exportSchema(node: t.Node, options: RuntimeExportOptions): OpenApiSchema | null {
    const runtimeSchema = this.buildSchema(node);
    if (!runtimeSchema) {
      return null;
    }

    try {
      const jsonSchema = z.toJSONSchema(runtimeSchema, {
        target: "draft-2020-12",
        reused: "inline",
        cycles: "throw",
        unrepresentable: "throw",
        ...(options.contentType && options.contentType !== "response"
          ? { io: "input" as const }
          : {}),
      });

      return normalizeJsonSchema(jsonSchema);
    } catch (error) {
      logger.debug(`Zod runtime export fell back to AST conversion: ${String(error)}`);
      return null;
    }
  }

  private buildSchema(node: t.Node): z.ZodTypeAny | null {
    if (t.isCallExpression(node)) {
      const helperPath = getZodHelperPath(node);
      if (helperPath) {
        return this.buildRootSchema(node, helperPath);
      }

      if (t.isMemberExpression(node.callee) && t.isCallExpression(node.callee.object)) {
        const baseSchema = this.buildSchema(node.callee.object);
        if (!baseSchema || !t.isIdentifier(node.callee.property)) {
          return null;
        }

        return this.applyMethod(baseSchema, node.callee.property.name, node);
      }
    }

    return null;
  }

  private buildRootSchema(node: t.CallExpression, helperPath: string[]): z.ZodTypeAny | null {
    const helper = helperPath.join(".");

    switch (helper) {
      case "string":
        return z.string();
      case "number":
        return z.number();
      case "boolean":
        return z.boolean();
      case "any":
        return z.any();
      case "unknown":
        return z.unknown();
      case "null":
        return z.null();
      case "undefined":
        return z.undefined();
      case "stringbool":
        return z.stringbool();
      case "email":
        return z.email();
      case "url":
      case "uri":
        return z.url();
      case "uuid":
        return z.uuid();
      case "guid":
        return z.guid();
      case "cuid":
        return z.cuid();
      case "ipv4":
        return z.ipv4();
      case "ipv6":
        return z.ipv6();
      case "iso.datetime":
        return z.iso.datetime();
      case "iso.date":
        return z.iso.date();
      case "iso.time":
        return z.iso.time();
      case "iso.duration":
        return z.iso.duration();
      case "coerce.string":
        return z.coerce.string();
      case "coerce.number":
        return z.coerce.number();
      case "coerce.boolean":
        return z.coerce.boolean();
      case "literal":
        return node.arguments[0]
          ? z.literal(this.buildLiteralValue(node.arguments[0]) as never)
          : null;
      case "enum":
        return this.buildEnum(node);
      case "array":
        return node.arguments[0] && isProcessableNode(node.arguments[0])
          ? z.array(this.buildSchema(node.arguments[0]) ?? z.unknown())
          : z.array(z.unknown());
      case "object":
        return this.buildObject(node);
      case "record":
        return this.buildRecord(node);
      case "union":
        return this.buildUnion(node);
      case "discriminatedUnion":
        return this.buildDiscriminatedUnion(node);
      case "intersection":
        return this.buildIntersection(node);
      case "tuple":
        return this.buildTuple(node);
      case "templateLiteral":
        return this.buildTemplateLiteral(node);
      default:
        return null;
    }
  }

  private buildObject(node: t.CallExpression): z.ZodTypeAny | null {
    if (node.arguments.length === 0 || !t.isObjectExpression(node.arguments[0])) {
      return z.object({});
    }

    const shape: Record<string, z.ZodTypeAny> = {};
    for (const property of node.arguments[0].properties) {
      if (!t.isObjectProperty(property)) {
        return null;
      }

      const key = getObjectKey(property.key);
      if (!key || !isProcessableNode(property.value)) {
        return null;
      }

      const propertySchema = this.buildSchema(property.value);
      if (!propertySchema) {
        return null;
      }

      shape[key] = propertySchema;
    }

    return z.object(shape);
  }

  private buildEnum(node: t.CallExpression): z.ZodTypeAny | null {
    const firstArgument = node.arguments[0];
    if (!firstArgument) {
      return null;
    }

    if (t.isArrayExpression(firstArgument)) {
      const values = firstArgument.elements.flatMap((element) => {
        if (!element || t.isArgumentPlaceholder(element)) {
          return [];
        }
        if (t.isStringLiteral(element)) {
          return [element.value];
        }
        return [];
      });

      return values.length > 0 ? z.enum(values as [string, ...string[]]) : null;
    }

    if (t.isObjectExpression(firstArgument)) {
      const values: Record<string, string> = {};
      for (const property of firstArgument.properties) {
        if (!t.isObjectProperty(property)) {
          return null;
        }

        const key = getObjectKey(property.key);
        if (!key || !t.isStringLiteral(property.value)) {
          return null;
        }

        values[key] = property.value.value;
      }

      return z.enum(values);
    }

    return null;
  }

  private buildRecord(node: t.CallExpression): z.ZodTypeAny | null {
    const valueArg = node.arguments.length > 1 ? node.arguments[1] : node.arguments[0];
    if (!valueArg || !isProcessableNode(valueArg)) {
      return z.record(z.string(), z.unknown());
    }

    const valueSchema = this.buildSchema(valueArg);
    return valueSchema ? z.record(z.string(), valueSchema) : null;
  }

  private buildUnion(node: t.CallExpression): z.ZodTypeAny | null {
    if (node.arguments.length === 0 || !t.isArrayExpression(node.arguments[0])) {
      return null;
    }

    const options = node.arguments[0].elements.flatMap((element) => {
      if (!isProcessableNode(element)) {
        return [];
      }
      const schema = this.buildSchema(element);
      return schema ? [schema] : [];
    });

    if (options.length === 0) {
      return null;
    }

    return z.union(options as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]]);
  }

  private buildDiscriminatedUnion(node: t.CallExpression): z.ZodTypeAny | null {
    const discriminator = node.arguments[0];
    const optionsNode = node.arguments[1];
    if (!t.isStringLiteral(discriminator) || !t.isArrayExpression(optionsNode)) {
      return null;
    }

    const options = optionsNode.elements.flatMap((element) => {
      if (!isProcessableNode(element)) {
        return [];
      }
      const schema = this.buildSchema(element);
      return schema && isObjectLikeSchema(schema) ? [schema] : [];
    });

    if (options.length < 2) {
      return null;
    }

    return z.discriminatedUnion(
      discriminator.value,
      options as [z.ZodObject<any>, z.ZodObject<any>, ...z.ZodObject<any>[]],
    );
  }

  private buildIntersection(node: t.CallExpression): z.ZodTypeAny | null {
    const [leftNode, rightNode] = node.arguments;
    if (!leftNode || !rightNode || !isProcessableNode(leftNode) || !isProcessableNode(rightNode)) {
      return null;
    }

    const left = this.buildSchema(leftNode);
    const right = this.buildSchema(rightNode);
    return left && right ? z.intersection(left, right) : null;
  }

  private buildTuple(node: t.CallExpression): z.ZodTypeAny | null {
    if (node.arguments.length === 0 || !t.isArrayExpression(node.arguments[0])) {
      return z.tuple([]);
    }

    const items = node.arguments[0].elements.flatMap((element) => {
      if (!isProcessableNode(element)) {
        return [];
      }
      const schema = this.buildSchema(element);
      return schema ? [schema] : [];
    });

    return z.tuple(items as []);
  }

  private buildTemplateLiteral(node: t.CallExpression): z.ZodTypeAny | null {
    if (node.arguments.length === 0 || !t.isArrayExpression(node.arguments[0])) {
      return null;
    }

    const parts: Array<string | z.ZodTypeAny> = [];
    for (const element of node.arguments[0].elements) {
      if (!isProcessableNode(element)) {
        return null;
      }
      if (t.isStringLiteral(element)) {
        parts.push(element.value);
        continue;
      }

      const schema = this.buildSchema(element);
      if (!schema) {
        return null;
      }
      parts.push(schema);
    }

    return parts.length > 0 ? z.templateLiteral(parts as []) : null;
  }

  private applyMethod(
    schema: z.ZodTypeAny,
    methodName: string,
    node: t.CallExpression,
  ): z.ZodTypeAny | null {
    switch (methodName) {
      case "optional":
        return schema.optional();
      case "nullable":
        return schema.nullable();
      case "nullish":
        return schema.nullish();
      case "describe":
        return node.arguments[0] && t.isStringLiteral(node.arguments[0])
          ? schema.describe(node.arguments[0].value)
          : schema;
      case "deprecated":
        return schema.meta({ deprecated: true });
      case "meta": {
        const metadata = node.arguments[0] ? this.buildMetadataObject(node.arguments[0]) : null;
        return metadata ? schema.meta(metadata) : schema;
      }
      case "default":
      case "prefault":
      case "catch": {
        const value = node.arguments[0] ? this.buildLiteralValue(node.arguments[0]) : undefined;
        if (typeof value === "undefined") {
          return schema;
        }
        if (methodName === "default") {
          return schema.default(value);
        }
        if (methodName === "prefault" && "prefault" in schema) {
          return (
            schema as z.ZodTypeAny & { prefault: (value: JsonValue) => z.ZodTypeAny }
          ).prefault(value);
        }
        if (methodName === "catch") {
          return schema.catch(value);
        }
        return schema;
      }
      case "min":
      case "max":
      case "length":
      case "startsWith":
      case "endsWith":
      case "includes":
        return this.applySimpleMethod(schema, methodName, node.arguments[0]);
      case "regex":
        return node.arguments[0] && t.isRegExpLiteral(node.arguments[0])
          ? (schema as any).regex(new RegExp(node.arguments[0].pattern, node.arguments[0].flags))
          : schema;
      case "email":
      case "url":
      case "uuid":
      case "cuid":
      case "guid":
      case "ipv4":
      case "ipv6":
      case "int":
      case "positive":
      case "nonnegative":
      case "negative":
      case "nonpositive":
      case "safe":
      case "finite":
      case "readonly":
        return this.applySimpleMethod(schema, methodName);
      case "brand":
      case "refine":
      case "superRefine":
      case "transform":
        return schema;
      case "pipe": {
        const nextNode = node.arguments[0];
        if (!nextNode || !isProcessableNode(nextNode)) {
          return schema;
        }
        const nextSchema = this.buildSchema(nextNode);
        return nextSchema ? schema.pipe(nextSchema) : null;
      }
      case "pick":
      case "omit":
      case "required": {
        const mask = node.arguments[0] ? this.buildBooleanMask(node.arguments[0]) : null;
        if (!mask || typeof (schema as any)[methodName] !== "function") {
          return null;
        }
        return (schema as any)[methodName](mask);
      }
      case "partial":
        return typeof (schema as any).partial === "function" ? (schema as any).partial() : null;
      case "extend": {
        const extension = node.arguments[0];
        if (
          !extension ||
          !t.isObjectExpression(extension) ||
          typeof (schema as any).extend !== "function"
        ) {
          return null;
        }
        const shape: Record<string, z.ZodTypeAny> = {};
        for (const property of extension.properties) {
          if (!t.isObjectProperty(property)) {
            return null;
          }
          const key = getObjectKey(property.key);
          if (!key || !isProcessableNode(property.value)) {
            return null;
          }
          const propertySchema = this.buildSchema(property.value);
          if (!propertySchema) {
            return null;
          }
          shape[key] = propertySchema;
        }
        return (schema as any).extend(shape);
      }
      default:
        return typeof (schema as any)[methodName] === "function"
          ? (schema as any)[methodName]()
          : null;
    }
  }

  private applySimpleMethod(
    schema: z.ZodTypeAny,
    methodName: string,
    firstArgument?: t.CallExpression["arguments"][number],
  ): z.ZodTypeAny | null {
    if (typeof (schema as any)[methodName] !== "function") {
      return null;
    }

    if (!firstArgument || t.isArgumentPlaceholder(firstArgument)) {
      return (schema as any)[methodName]();
    }

    if (t.isNumericLiteral(firstArgument) || t.isStringLiteral(firstArgument)) {
      return (schema as any)[methodName](firstArgument.value);
    }

    return null;
  }

  private buildMetadataObject(node: t.Node): Record<string, JsonValue> | null {
    if (!t.isObjectExpression(node)) {
      return null;
    }

    const metadata: Record<string, JsonValue> = {};
    for (const property of node.properties) {
      if (!t.isObjectProperty(property)) {
        return null;
      }

      const key = getObjectKey(property.key);
      const value = this.buildLiteralValue(property.value);
      if (!key || typeof value === "undefined") {
        return null;
      }

      metadata[key] = value;
    }

    return metadata;
  }

  private buildBooleanMask(node: t.Node): Record<string, true> | null {
    if (!t.isObjectExpression(node)) {
      return null;
    }

    const mask: Record<string, true> = {};
    for (const property of node.properties) {
      if (!t.isObjectProperty(property)) {
        return null;
      }

      const key = getObjectKey(property.key);
      if (!key || !t.isBooleanLiteral(property.value) || !property.value.value) {
        return null;
      }

      mask[key] = true;
    }

    return mask;
  }

  private buildLiteralValue(node: t.Node): JsonValue | undefined {
    if (t.isStringLiteral(node)) {
      return node.value;
    }
    if (t.isNumericLiteral(node)) {
      return node.value;
    }
    if (t.isBooleanLiteral(node)) {
      return node.value;
    }
    if (t.isNullLiteral(node)) {
      return null;
    }
    if (t.isArrayExpression(node)) {
      const values: JsonValue[] = [];
      for (const element of node.elements) {
        if (!isProcessableNode(element)) {
          return undefined;
        }
        const value = this.buildLiteralValue(element);
        if (typeof value === "undefined") {
          return undefined;
        }
        values.push(value);
      }
      return values;
    }
    if (t.isObjectExpression(node)) {
      const value: Record<string, JsonValue> = {};
      for (const property of node.properties) {
        if (!t.isObjectProperty(property)) {
          return undefined;
        }
        const key = getObjectKey(property.key);
        const propertyValue = this.buildLiteralValue(property.value);
        if (!key || typeof propertyValue === "undefined") {
          return undefined;
        }
        value[key] = propertyValue;
      }
      return value;
    }

    return undefined;
  }
}

function getZodHelperPath(node: t.CallExpression): string[] | null {
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

  return t.isIdentifier(currentObject, { name: "z" }) ? path : null;
}

function getObjectKey(key: t.ObjectProperty["key"]): string | null {
  if (t.isIdentifier(key)) {
    return key.name;
  }
  if (t.isStringLiteral(key)) {
    return key.value;
  }
  return null;
}

function isProcessableNode(
  node: t.Node | null | undefined,
): node is Exclude<t.Node, t.SpreadElement | t.ArgumentPlaceholder> {
  return Boolean(node) && !t.isSpreadElement(node) && !t.isArgumentPlaceholder(node);
}

function isObjectLikeSchema(schema: z.ZodTypeAny): schema is z.ZodObject<any> {
  return typeof (schema as any).shape === "object" || typeof (schema as any).shape === "function";
}

function normalizeJsonSchema(schema: z.core.JSONSchema.BaseSchema | boolean): OpenApiSchema {
  if (typeof schema === "boolean") {
    return schema ? {} : { not: {} };
  }

  const normalized = structuredClone(schema) as OpenApiSchema;
  delete normalized.$schema;
  if (normalized.format && typeof normalized.pattern === "string") {
    delete normalized.pattern;
  }
  return normalized;
}
