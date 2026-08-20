import type {
  NativeCheckerApi,
  NativeFlagTable,
  NativeNode,
  NativeNodeHandle,
  NativeProjectApi,
  NativeSymbol,
  NativeType,
} from "./native-typescript-types.js";
import type { OpenAPIDefinition } from "./types.js";
import { isDateType } from "./typescript-adapter.js";

export type NativeSchemaHost = {
  objectFlags: NativeFlagTable;
  symbolFlags: NativeFlagTable;
  typeFlags: NativeFlagTable;
};

export function resolveNodeHandle(
  handle: NativeNodeHandle | undefined,
  project: NativeProjectApi,
): NativeNode | undefined {
  if (!handle) {
    return undefined;
  }

  if (isNativeNode(handle)) {
    return handle;
  }

  return handle.resolve(project);
}

export function isNativeNode(handle: NativeNodeHandle): handle is NativeNode {
  return "forEachChild" in handle && "getSourceFile" in handle;
}

export function getNativeTypeArguments(
  type: NativeType,
  checker: NativeCheckerApi,
): readonly NativeType[] {
  try {
    return checker.getTypeArguments(type);
  } catch {
    return [];
  }
}

export function isNativeStringLiteralType(type: NativeType, typeFlags: NativeFlagTable): boolean {
  return Boolean(type.isStringLiteralType?.() ?? type.flags & (typeFlags.StringLiteral ?? 0));
}

export function isNativeNumberLiteralType(type: NativeType, typeFlags: NativeFlagTable): boolean {
  return Boolean(type.isNumberLiteralType?.() ?? type.flags & (typeFlags.NumberLiteral ?? 0));
}

export function isNativeUnionType(type: NativeType, typeFlags: NativeFlagTable): boolean {
  return Boolean(type.flags & (typeFlags.Union ?? 0));
}

export function isNativeTupleType(
  type: NativeType,
  checker: NativeCheckerApi,
  objectFlags: NativeFlagTable,
): boolean {
  const tupleByMethod = checker.isTupleType?.(type);
  if (typeof tupleByMethod === "boolean") {
    return tupleByMethod;
  }

  return (
    Boolean(type.objectFlags && type.objectFlags & (objectFlags.Tuple ?? 0)) ||
    checker.typeToString(type).startsWith("[")
  );
}

export function isNativeArrayType(
  type: NativeType,
  checker: NativeCheckerApi,
  objectFlags: NativeFlagTable,
): boolean {
  const arrayByMethod = checker.isArrayType?.(type);
  if (typeof arrayByMethod === "boolean") {
    return arrayByMethod;
  }

  return checker.isArrayLikeType(type) && !isNativeTupleType(type, checker, objectFlags);
}

export function typeToOpenApiSchema(
  type: NativeType,
  checker: NativeCheckerApi,
  project: NativeProjectApi,
  seen: Set<string>,
  host: NativeSchemaHost,
): OpenAPIDefinition {
  if (isDateType(type, checker)) {
    return { type: "string", format: "date-time" };
  }

  const typeFlags = host.typeFlags;
  const primitiveLikeFlags =
    (typeFlags.StringLike ?? 0) |
    (typeFlags.NumberLike ?? 0) |
    (typeFlags.BooleanLike ?? 0) |
    (typeFlags.BooleanLiteral ?? 0) |
    (typeFlags.TemplateLiteral ?? 0) |
    (typeFlags.Null ?? 0) |
    (typeFlags.Undefined ?? 0);
  const apparentType = checker.getApparentType?.(type);
  if (
    apparentType &&
    !(type.flags & primitiveLikeFlags) &&
    apparentType !== type &&
    checker.getPropertiesOfType(apparentType).length > 0
  ) {
    type = apparentType;
  }

  const seenKey = checker.typeToString(type);
  if (seen.has(seenKey)) {
    return { type: "object" };
  }

  const trivialFlags =
    primitiveLikeFlags |
    (typeFlags.Any ?? 0) |
    (typeFlags.Never ?? 0) |
    (typeFlags.Unknown ?? 0) |
    (typeFlags.Void ?? 0);
  if (!(type.flags & trivialFlags)) {
    seen.add(seenKey);
  }

  if (isNativeStringLiteralType(type, typeFlags)) {
    return { type: "string", enum: [String(type.value)] };
  }

  if (isNativeNumberLiteralType(type, typeFlags)) {
    return { type: "number", enum: [Number(type.value)] };
  }

  if (type.flags & (typeFlags.BooleanLiteral ?? 0)) {
    return { type: "boolean", enum: [checker.typeToString(type) === "true"] };
  }

  if (type.flags & (typeFlags.TemplateLiteral ?? 0)) {
    return { type: "string" };
  }

  if (type.flags & (typeFlags.StringLike ?? 0)) {
    return { type: "string" };
  }
  if (type.flags & (typeFlags.NumberLike ?? 0)) {
    return { type: "number" };
  }
  if (type.flags & (typeFlags.BooleanLike ?? 0)) {
    return { type: "boolean" };
  }
  if (type.flags & (typeFlags.Null ?? 0)) {
    return { type: "null" };
  }

  if (isNativeUnionType(type, typeFlags)) {
    return convertNativeUnionType(type, checker, project, seen, host);
  }

  if (isNativeTupleType(type, checker, host.objectFlags)) {
    const itemTypes = getNativeTypeArguments(type, checker);
    return {
      type: "array",
      prefixItems: itemTypes.map((itemType) =>
        typeToOpenApiSchema(itemType, checker, project, seen, host),
      ),
      items: false,
      minItems: itemTypes.length,
      maxItems: itemTypes.length,
    };
  }

  if (isNativeArrayType(type, checker, host.objectFlags)) {
    const elementType = getNativeTypeArguments(type, checker)[0];
    return {
      type: "array",
      items: elementType
        ? typeToOpenApiSchema(elementType, checker, project, seen, host)
        : { type: "object" },
    };
  }

  const properties = checker.getPropertiesOfType(type);
  if (properties.length > 0) {
    return convertNativeObjectType(checker, project, seen, host, properties);
  }

  const indexInfos = checker.getIndexInfosOfType(type);
  const numberIndexInfo = indexInfos.find(
    (indexInfo) => checker.typeToString(indexInfo.keyType) === "number",
  );
  if (numberIndexInfo) {
    return {
      type: "array",
      items: typeToOpenApiSchema(numberIndexInfo.valueType, checker, project, seen, host),
    };
  }

  const stringIndexInfo = indexInfos.find(
    (indexInfo) => checker.typeToString(indexInfo.keyType) === "string",
  );
  if (stringIndexInfo) {
    return {
      type: "object",
      additionalProperties: typeToOpenApiSchema(
        stringIndexInfo.valueType,
        checker,
        project,
        seen,
        host,
      ),
    };
  }

  return { type: "object" };
}

function convertNativeUnionType(
  type: NativeType,
  checker: NativeCheckerApi,
  project: NativeProjectApi,
  seen: Set<string>,
  host: NativeSchemaHost,
): OpenAPIDefinition {
  const typeFlags = host.typeFlags;
  const unionTypes = type.getTypes?.() ?? [];
  const nullable = unionTypes.some((member) => Boolean(member.flags & (typeFlags.Null ?? 0)));
  const nonNullTypes = unionTypes.filter((member) => !(member.flags & (typeFlags.Null ?? 0)));
  const allLiterals = nonNullTypes.every(
    (member) =>
      isNativeStringLiteralType(member, typeFlags) ||
      isNativeNumberLiteralType(member, typeFlags) ||
      Boolean(member.flags & (typeFlags.BooleanLiteral ?? 0)),
  );
  if (allLiterals && nonNullTypes.length > 0) {
    const enumValues = nonNullTypes.map((member) => {
      if (isNativeStringLiteralType(member, typeFlags)) {
        return String(member.value);
      }

      if (isNativeNumberLiteralType(member, typeFlags)) {
        return Number(member.value);
      }

      return checker.typeToString(member) === "true";
    });
    const valueType = typeof enumValues[0];
    return {
      type: valueType === "number" ? "number" : valueType === "boolean" ? "boolean" : "string",
      enum: enumValues,
      ...(nullable ? { nullable: true } : {}),
    };
  }

  if (nullable && nonNullTypes.length === 1 && nonNullTypes[0]) {
    return {
      ...typeToOpenApiSchema(nonNullTypes[0], checker, project, seen, host),
      nullable: true,
    };
  }

  return {
    oneOf: nonNullTypes.map((member) => typeToOpenApiSchema(member, checker, project, seen, host)),
  };
}

function convertNativeObjectType(
  checker: NativeCheckerApi,
  project: NativeProjectApi,
  seen: Set<string>,
  host: NativeSchemaHost,
  properties: readonly NativeSymbol[],
): OpenAPIDefinition {
  const schemaProperties: Record<string, OpenAPIDefinition> = {};
  const required: string[] = [];
  for (const property of properties) {
    const propertyDeclaration = resolveNodeHandle(
      property.valueDeclaration ?? property.declarations?.[0],
      project,
    );
    if (!propertyDeclaration) {
      continue;
    }

    const propertyType =
      checker.getTypeOfSymbol(property) ??
      checker.getTypeOfSymbolAtLocation(property, propertyDeclaration);
    if (propertyType) {
      schemaProperties[property.name] = typeToOpenApiSchema(
        propertyType,
        checker,
        project,
        seen,
        host,
      );
    }
    if (!(property.flags & (host.symbolFlags.Optional ?? 0))) {
      required.push(property.name);
    }
  }

  return required.length > 0
    ? { type: "object", properties: schemaProperties, required }
    : { type: "object", properties: schemaProperties };
}
