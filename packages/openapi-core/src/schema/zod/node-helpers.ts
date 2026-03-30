import * as t from "@babel/types";

import type { OpenApiSchema } from "../../shared/types.js";

type ProcessableZodNode = t.Expression | t.SpreadElement;
type ProcessZodNode = (node: ProcessableZodNode) => OpenApiSchema;
type PrimitiveHelperContext = {
  processNode: ProcessZodNode;
  processObject: (node: t.CallExpression) => OpenApiSchema;
  ensureSchema: (schemaName: string) => void;
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

export function processZodLiteral(node: t.CallExpression): OpenApiSchema {
  if (node.arguments.length === 0) {
    return { type: "string" };
  }

  const arg = node.arguments[0];

  if (t.isStringLiteral(arg)) {
    return {
      type: "string",
      enum: [arg.value],
    };
  }
  if (t.isNumericLiteral(arg)) {
    return {
      type: "number",
      enum: [arg.value],
    };
  }
  if (t.isBooleanLiteral(arg)) {
    return {
      type: "boolean",
      enum: [arg.value],
    };
  }

  return { type: "string" };
}

export function processZodDiscriminatedUnion(
  node: t.CallExpression,
  processNode: ProcessZodNode,
): OpenApiSchema {
  if (node.arguments.length < 2) {
    return { type: "object" };
  }

  let discriminator = "";
  if (t.isStringLiteral(node.arguments[0])) {
    discriminator = node.arguments[0].value;
  }

  const schemasArray = node.arguments[1];
  if (!t.isArrayExpression(schemasArray)) {
    return { type: "object" };
  }

  const schemas = schemasArray.elements
    .filter(isProcessableZodNode)
    .map((element) => processNode(element));

  if (schemas.length === 0) {
    return { type: "object" };
  }

  return discriminator
    ? {
        type: "object",
        discriminator: {
          propertyName: discriminator,
        },
        oneOf: schemas,
      }
    : {
        type: "object",
        oneOf: schemas,
      };
}

export function processZodTuple(
  node: t.CallExpression,
  processNode: ProcessZodNode,
): OpenApiSchema {
  if (node.arguments.length === 0 || !t.isArrayExpression(node.arguments[0])) {
    return { type: "array", items: { type: "string" } };
  }

  const tupleItems = node.arguments[0].elements
    .filter(isProcessableZodNode)
    .map((element) => processNode(element));

  return {
    type: "array",
    items: tupleItems.length > 0 ? tupleItems[0] : { type: "string" },
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
): OpenApiSchema {
  if (node.arguments.length === 0 || !t.isArrayExpression(node.arguments[0])) {
    return { type: "object" };
  }

  const unionItems = node.arguments[0].elements
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

function getZodCalleePath(node: t.CallExpression): string[] | null {
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

  if (!t.isIdentifier(currentObject, { name: "z" })) {
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

  const zodCalleePath = getZodCalleePath(node);
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
      schema = { type: "string", format: "uuid" };
      break;
    case "cuid":
      schema = { type: "string", format: "cuid" };
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
    case "any":
    case "unknown":
      schema = {};
      break;
    case "null":
    case "undefined":
      schema = { type: "null" };
      break;
    case "array": {
      let itemsType: OpenApiSchema = { type: "string" };
      if (node.arguments.length > 0) {
        const firstArgument = node.arguments[0];
        if (t.isIdentifier(firstArgument)) {
          const schemaName = firstArgument.name;
          context.ensureSchema(schemaName);
          itemsType = { $ref: `#/components/schemas/${schemaName}` };
        } else if (isProcessableZodNode(firstArgument)) {
          itemsType = context.processNode(firstArgument);
        }
      }
      schema = { type: "array", items: itemsType };
      break;
    }
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
      } else {
        schema = { type: "string" };
      }
      break;
    case "record": {
      let valueType: OpenApiSchema = { type: "string" };
      if (node.arguments.length > 0) {
        const firstArgument = node.arguments[0];
        if (isProcessableZodNode(firstArgument)) {
          valueType = context.processNode(firstArgument);
        }
      }
      schema = {
        type: "object",
        additionalProperties: valueType,
      };
      break;
    }
    case "map":
      schema = {
        type: "object",
        additionalProperties: true,
      };
      break;
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
    case "custom":
      if (node.typeParameters && node.typeParameters.params.length > 0) {
        const typeParam = node.typeParameters.params[0];
        if (
          t.isTSTypeReference(typeParam) &&
          t.isIdentifier(typeParam.typeName) &&
          typeParam.typeName.name === "File"
        ) {
          schema = {
            type: "string",
            format: "binary",
          };
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
