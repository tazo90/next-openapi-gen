import fs from "fs";
import path from "path";
import traverse from "@babel/traverse";
import * as t from "@babel/types";

import { parseTypeScriptFile } from "./utils.js";
import { ZodSchemaConverter } from "./zod-converter.js";
import {
  ContentType,
  OpenAPIDefinition,
  ParamSchema,
  PropertyOptions,
  SchemaType,
} from "../types.js";
import { logger } from "./logger.js";

export class SchemaProcessor {
  private schemaDir: string;
  private typeDefinitions: Record<string, any> = {};
  private openapiDefinitions: Record<string, OpenAPIDefinition> = {};
  private contentType: ContentType = "";

  private directoryCache: Record<string, string[]> = {};
  private statCache: Record<string, fs.Stats> = {};
  private processSchemaTracker: Record<string, boolean> = {};
  private processingTypes: Set<string> = new Set();

  private zodSchemaConverter: ZodSchemaConverter | null;
  private schemaType: SchemaType;
  private isResolvingPickOmitBase: boolean = false;

  constructor(schemaDir: string, schemaType: SchemaType = "typescript") {
    this.schemaDir = path.resolve(schemaDir);
    this.schemaType = schemaType;

    if (schemaType === "zod") {
      this.zodSchemaConverter = new ZodSchemaConverter(schemaDir);
    }
  }

  /**
   * Get all defined schemas (for components.schemas section)
   */
  public getDefinedSchemas(): Record<string, OpenAPIDefinition> {
    // If using Zod, also include all processed Zod schemas
    if (this.schemaType === "zod" && this.zodSchemaConverter) {
      const zodSchemas = this.zodSchemaConverter.getProcessedSchemas();
      return {
        ...this.openapiDefinitions,
        ...zodSchemas,
      };
    }
    return this.openapiDefinitions;
  }

  public findSchemaDefinition(
    schemaName: string,
    contentType: ContentType
  ): OpenAPIDefinition {
    let schemaNode: t.Node | null = null;

    // Assign type that is actually processed
    this.contentType = contentType;

    // Check if we should use Zod schemas
    if (this.schemaType === "zod") {
      logger.debug(`Looking for Zod schema: ${schemaName}`);

      // Check type mapping first
      const mappedSchemaName =
        this.zodSchemaConverter.typeToSchemaMapping[schemaName];
      if (mappedSchemaName) {
        logger.debug(
          `Type '${schemaName}' is mapped to Zod schema '${mappedSchemaName}'`
        );
      }

      // Try to convert Zod schema
      const zodSchema =
        this.zodSchemaConverter.convertZodSchemaToOpenApi(schemaName);
      if (zodSchema) {
        logger.debug(`Found and processed Zod schema: ${schemaName}`);
        this.openapiDefinitions[schemaName] = zodSchema;
        return zodSchema;
      }

      logger.debug(
        `No Zod schema found for ${schemaName}, trying TypeScript fallback`
      );
    }

    // Fall back to TypeScript types
    this.scanSchemaDir(this.schemaDir, schemaName);
    return schemaNode;
  }

  private scanSchemaDir(dir: string, schemaName: string) {
    let files = this.directoryCache[dir];
    if (typeof files === "undefined") {
      files = fs.readdirSync(dir);
      this.directoryCache[dir] = files;
    }

    files.forEach((file) => {
      const filePath = path.join(dir, file);
      let stat = this.statCache[filePath];
      if (typeof stat === "undefined") {
        stat = fs.statSync(filePath);
        this.statCache[filePath] = stat;
      }

      if (stat.isDirectory()) {
        this.scanSchemaDir(filePath, schemaName);
      } else if (file.endsWith(".ts") || file.endsWith(".tsx")) {
        this.processSchemaFile(filePath, schemaName);
      }
    });
  }

  private collectTypeDefinitions(ast: any, schemaName: string): void {
    traverse.default(ast, {
      VariableDeclarator: (path: any) => {
        if (t.isIdentifier(path.node.id, { name: schemaName })) {
          const name = path.node.id.name;
          this.typeDefinitions[name] = path.node.init || path.node;
        }
      },
      TSTypeAliasDeclaration: (path: any) => {
        if (t.isIdentifier(path.node.id, { name: schemaName })) {
          const name = path.node.id.name;
          this.typeDefinitions[name] = path.node.typeAnnotation;
        }
      },
      TSInterfaceDeclaration: (path: any) => {
        if (t.isIdentifier(path.node.id, { name: schemaName })) {
          const name = path.node.id.name;
          this.typeDefinitions[name] = path.node;
        }
      },
      TSEnumDeclaration: (path: any) => {
        if (t.isIdentifier(path.node.id, { name: schemaName })) {
          const name = path.node.id.name;
          this.typeDefinitions[name] = path.node;
        }
      },
      // Collect exported zod schemas
      ExportNamedDeclaration: (path: any) => {
        if (t.isVariableDeclaration(path.node.declaration)) {
          path.node.declaration.declarations.forEach((declaration: any) => {
            if (
              t.isIdentifier(declaration.id) &&
              declaration.id.name === schemaName &&
              declaration.init
            ) {
              // Check if is Zod schema
              if (
                t.isCallExpression(declaration.init) &&
                t.isMemberExpression(declaration.init.callee) &&
                t.isIdentifier(declaration.init.callee.object) &&
                declaration.init.callee.object.name === "z"
              ) {
                const name = declaration.id.name;
                this.typeDefinitions[name] = declaration.init;
              }
            }
          });
        }
      },
    });
  }

  private resolveType(typeName: string): OpenAPIDefinition {
    if (this.processingTypes.has(typeName)) {
      // Return reference to type to avoid infinite recursion
      return { $ref: `#/components/schemas/${typeName}` };
    }
    // Add type to processing types
    this.processingTypes.add(typeName);

    try {
      // If we are using Zod and the given type is not found yet, try using Zod converter first
      if (this.schemaType === "zod" && !this.openapiDefinitions[typeName]) {
        const zodSchema =
          this.zodSchemaConverter.convertZodSchemaToOpenApi(typeName);
        if (zodSchema) {
          this.openapiDefinitions[typeName] = zodSchema;
          return zodSchema;
        }
      }

      const typeNode = this.typeDefinitions[typeName.toString()];
      if (!typeNode) return {};

      // Check if node is Zod
      if (
        t.isCallExpression(typeNode) &&
        t.isMemberExpression(typeNode.callee) &&
        t.isIdentifier(typeNode.callee.object) &&
        typeNode.callee.object.name === "z"
      ) {
        if (this.schemaType === "zod") {
          const zodSchema = this.zodSchemaConverter.processZodNode(typeNode);
          if (zodSchema) {
            this.openapiDefinitions[typeName] = zodSchema;
            return zodSchema;
          }
        }
      }

      if (t.isTSEnumDeclaration(typeNode)) {
        const enumValues = this.processEnum(typeNode);
        return enumValues;
      }

      if (
        t.isTSTypeLiteral(typeNode) ||
        t.isTSInterfaceBody(typeNode) ||
        t.isTSInterfaceDeclaration(typeNode)
      ) {
        const properties: Record<string, any> = {};

        // Handle interface extends clause
        if (
          t.isTSInterfaceDeclaration(typeNode) &&
          typeNode.extends &&
          typeNode.extends.length > 0
        ) {
          typeNode.extends.forEach((extendedType: any) => {
            const extendedSchema = this.resolveTSNodeType(extendedType);
            if (extendedSchema.properties) {
              Object.assign(properties, extendedSchema.properties);
            }
          });
        }

        // Get members from interface declaration body or direct members
        const members = t.isTSInterfaceDeclaration(typeNode)
          ? typeNode.body.body
          : (typeNode as any).members;

        if (members) {
          (members || []).forEach((member: any) => {
            if (t.isTSPropertySignature(member) && t.isIdentifier(member.key)) {
              const propName = member.key.name;
              const options = this.getPropertyOptions(member);

              const property = {
                ...this.resolveTSNodeType(
                  member.typeAnnotation?.typeAnnotation
                ),
                ...options,
              };

              properties[propName] = property;
            }
          });
        }

        return { type: "object", properties };
      }

      if (t.isTSArrayType(typeNode)) {
        return {
          type: "array",
          items: this.resolveTSNodeType(typeNode.elementType),
        };
      }

      if (t.isTSUnionType(typeNode)) {
        return this.resolveTSNodeType(typeNode);
      }

      if (t.isTSTypeReference(typeNode)) {
        return this.resolveTSNodeType(typeNode);
      }

      return {};
    } finally {
      // Remove type from processed set after we finish
      this.processingTypes.delete(typeName);
    }
  }

  private isDateString(node: any): boolean {
    if (t.isStringLiteral(node)) {
      const dateRegex = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z)?$/;
      return dateRegex.test(node.value);
    }
    return false;
  }

  private isDateObject(node: any): boolean {
    return (
      t.isNewExpression(node) && t.isIdentifier(node.callee, { name: "Date" })
    );
  }

  private isDateNode(node: any): boolean {
    return this.isDateString(node) || this.isDateObject(node);
  }

  private resolveTSNodeType(node: any): OpenAPIDefinition {
    if (!node) return { type: "object" }; // Default type for undefined/null

    if (t.isTSStringKeyword(node)) return { type: "string" };
    if (t.isTSNumberKeyword(node)) return { type: "number" };
    if (t.isTSBooleanKeyword(node)) return { type: "boolean" };
    if (t.isTSAnyKeyword(node) || t.isTSUnknownKeyword(node))
      return { type: "object" };
    if (
      t.isTSVoidKeyword(node) ||
      t.isTSNullKeyword(node) ||
      t.isTSUndefinedKeyword(node)
    )
      return { type: "null" };
    if (this.isDateNode(node)) return { type: "string", format: "date-time" };

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

        return this.resolveTSNodeType(syntheticNode);
      }
    }

    if (t.isTSTypeReference(node) && t.isIdentifier(node.typeName)) {
      const typeName = node.typeName.name;

      // Special handling for built-in types
      if (typeName === "Date") {
        return { type: "string", format: "date-time" };
      }

      if (typeName === "Array" || typeName === "ReadonlyArray") {
        if (node.typeParameters && node.typeParameters.params.length > 0) {
          return {
            type: "array",
            items: this.resolveTSNodeType(node.typeParameters.params[0]),
          };
        }
        return { type: "array", items: { type: "object" } };
      }

      if (typeName === "Record") {
        if (node.typeParameters && node.typeParameters.params.length > 1) {
          const keyType = this.resolveTSNodeType(node.typeParameters.params[0]);
          const valueType = this.resolveTSNodeType(
            node.typeParameters.params[1]
          );

          return {
            type: "object",
            additionalProperties: valueType,
          };
        }
        return { type: "object", additionalProperties: true };
      }

      if (
        typeName === "Partial" ||
        typeName === "Required" ||
        typeName === "Readonly"
      ) {
        if (node.typeParameters && node.typeParameters.params.length > 0) {
          return this.resolveTSNodeType(node.typeParameters.params[0]);
        }
      }

      if (typeName === "Pick" || typeName === "Omit") {
        if (node.typeParameters && node.typeParameters.params.length > 1) {
          const baseTypeParam = node.typeParameters.params[0];
          const keysParam = node.typeParameters.params[1];

          // Resolve base type without adding it to schema definitions
          this.isResolvingPickOmitBase = true;
          const baseType = this.resolveTSNodeType(baseTypeParam);
          this.isResolvingPickOmitBase = false;

          if (baseType.properties) {
            const properties: Record<string, any> = {};
            const keyNames = this.extractKeysFromLiteralType(keysParam);

            if (typeName === "Pick") {
              keyNames.forEach((key) => {
                if (baseType.properties[key]) {
                  properties[key] = baseType.properties[key];
                }
              });
            } else {
              // Omit
              Object.entries(baseType.properties).forEach(([key, value]) => {
                if (!keyNames.includes(key)) {
                  properties[key] = value;
                }
              });
            }

            return { type: "object", properties };
          }
        }

        // Fallback to just the base type if we can't process properly
        if (node.typeParameters && node.typeParameters.params.length > 0) {
          return this.resolveTSNodeType(node.typeParameters.params[0]);
        }
      }

      // Check if it is a type that we are already processing
      if (this.processingTypes.has(typeName)) {
        return { $ref: `#/components/schemas/${typeName}` };
      }

      // Find type definition
      this.findSchemaDefinition(typeName, this.contentType);

      return this.resolveType(node.typeName.name);
    }

    if (t.isTSArrayType(node)) {
      return {
        type: "array",
        items: this.resolveTSNodeType(node.elementType),
      };
    }

    if (t.isTSTypeLiteral(node)) {
      const properties: Record<string, any> = {};
      node.members.forEach((member: any) => {
        if (t.isTSPropertySignature(member) && t.isIdentifier(member.key)) {
          const propName = member.key.name;
          properties[propName] = this.resolveTSNodeType(
            member.typeAnnotation?.typeAnnotation
          );
        }
      });
      return { type: "object", properties };
    }

    if (t.isTSUnionType(node)) {
      // Handle union types with literal types, like "admin" | "member" | "guest"
      const literals = node.types.filter((type: any) =>
        t.isTSLiteralType(type)
      );

      // Check if all union elements are literals
      if (literals.length === node.types.length) {
        // All union members are literals, convert to enum
        const enumValues = literals
          .map((type: any) => {
            if (t.isTSLiteralType(type) && t.isStringLiteral(type.literal)) {
              return type.literal.value;
            } else if (
              t.isTSLiteralType(type) &&
              t.isNumericLiteral(type.literal)
            ) {
              return type.literal.value;
            } else if (
              t.isTSLiteralType(type) &&
              t.isBooleanLiteral(type.literal)
            ) {
              return type.literal.value;
            }
            return null;
          })
          .filter((value: any) => value !== null);

        if (enumValues.length > 0) {
          // Check if all enum values are of the same type
          const firstType = typeof enumValues[0];
          const sameType = enumValues.every(
            (val: any) => typeof val === firstType
          );

          if (sameType) {
            return {
              type: firstType,
              enum: enumValues,
            };
          }
        }
      }

      // Handling null | undefined in type union
      const nullableTypes = node.types.filter(
        (type: any) =>
          t.isTSNullKeyword(type) ||
          t.isTSUndefinedKeyword(type) ||
          t.isTSVoidKeyword(type)
      );

      const nonNullableTypes = node.types.filter(
        (type: any) =>
          !t.isTSNullKeyword(type) &&
          !t.isTSUndefinedKeyword(type) &&
          !t.isTSVoidKeyword(type)
      );

      // If a type can be null/undefined, we mark it as nullable
      if (nullableTypes.length > 0 && nonNullableTypes.length === 1) {
        const mainType = this.resolveTSNodeType(nonNullableTypes[0]);
        return {
          ...mainType,
          nullable: true,
        };
      }

      // Standard union type support via oneOf
      return {
        oneOf: node.types
          .filter(
            (type: any) =>
              !t.isTSNullKeyword(type) &&
              !t.isTSUndefinedKeyword(type) &&
              !t.isTSVoidKeyword(type)
          )
          .map((subNode: any) => this.resolveTSNodeType(subNode)),
      };
    }

    if (t.isTSIntersectionType(node)) {
      // For intersection types, we combine properties
      const allProperties: Record<string, any> = {};
      const requiredProperties: string[] = [];

      node.types.forEach((typeNode: any) => {
        const resolvedType = this.resolveTSNodeType(typeNode);
        if (resolvedType.type === "object" && resolvedType.properties) {
          Object.entries(resolvedType.properties).forEach(([key, value]) => {
            allProperties[key] = value;
            if (value.required) {
              requiredProperties.push(key);
            }
          });
        }
      });

      return {
        type: "object",
        properties: allProperties,
        required:
          requiredProperties.length > 0 ? requiredProperties : undefined,
      };
    }

    // Case where a type is a reference to another defined type
    if (t.isTSTypeReference(node) && t.isIdentifier(node.typeName)) {
      return { $ref: `#/components/schemas/${node.typeName.name}` };
    }

    logger.debug("Unrecognized TypeScript type node:", node);
    return { type: "object" }; // By default we return an object
  }

  private processSchemaFile(
    filePath: string,
    schemaName: string
  ): OpenAPIDefinition | undefined {
    // Check if the file has already been processed
    if (this.processSchemaTracker[`${filePath}-${schemaName}`]) return;

    try {
      // Recognizes different elements of TS like variable, type, interface, enum
      const content = fs.readFileSync(filePath, "utf-8");
      const ast = parseTypeScriptFile(content);

      this.collectTypeDefinitions(ast, schemaName);

      // Reset the set of processed types before each schema processing
      this.processingTypes.clear();
      const definition = this.resolveType(schemaName);
      if (!this.isResolvingPickOmitBase) {
        this.openapiDefinitions[schemaName] = definition;
      }

      this.processSchemaTracker[`${filePath}-${schemaName}`] = true;
      return definition;
    } catch (error) {
      logger.error(
        `Error processing schema file ${filePath} for schema ${schemaName}: ${error}`
      );
      return { type: "object" }; // By default we return an empty object on error
    }
  }

  private processEnum(enumNode: any): OpenAPIDefinition {
    // Initialization OpenAPI enum object
    const enumSchema: OpenAPIDefinition = {
      type: "string",
      enum: [],
    };

    // Iterate throught enum members
    enumNode.members.forEach((member: any) => {
      if (t.isTSEnumMember(member)) {
        // @ts-ignore
        const name = member.id?.name;
        // @ts-ignore
        const value = member.initializer?.value;
        let type = member.initializer?.type;

        if (type === "NumericLiteral") {
          enumSchema.type = "number";
        }

        const targetValue = value || name;

        if (enumSchema.enum) {
          enumSchema.enum.push(targetValue);
        }
      }
    });

    return enumSchema;
  }

  private extractKeysFromLiteralType(node: any): string[] {
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

  private getPropertyOptions(node: any): PropertyOptions {
    const isOptional = !!node.optional; // check if property is optional

    let description = null;
    // get comments for field
    if (node.trailingComments && node.trailingComments.length) {
      description = node.trailingComments[0].value.trim(); // get first comment
    }

    const options: PropertyOptions = {};

    if (description) {
      options.description = description;
    }

    if (this.contentType === "body") {
      options.nullable = isOptional;
    }

    return options;
  }

  /**
   * Generate example values based on parameter type and name
   */
  public getExampleForParam(paramName: string, type: string = "string"): any {
    // Common ID-like parameters
    if (
      paramName === "id" ||
      paramName.endsWith("Id") ||
      paramName.endsWith("_id")
    ) {
      return type === "string" ? "123" : 123;
    }

    // For specific common parameter names
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
        // Default examples by type
        if (type === "string") return "example";
        if (type === "number") return 1;
        if (type === "boolean") return true;
        return "example";
    }
  }

  private detectContentType(
    bodyType: string,
    explicitContentType?: string
  ): string {
    if (explicitContentType) {
      return explicitContentType;
    }

    // Automatic detection based on type name
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

  public createMultipleResponsesSchema(
    responses: Record<string, any>,
    defaultDescription?: string
  ): Record<string, any> {
    const result: Record<string, any> = {};

    Object.entries(responses).forEach(([code, response]) => {
      if (typeof response === "string") {
        // Reference do components/responses
        result[code] = { $ref: `#/components/responses/${response}` };
      } else {
        result[code] = {
          description: response.description || defaultDescription || "Response",
          content: {
            "application/json": {
              schema: response.schema || response,
            },
          },
        };
      }
    });

    return result;
  }

  private createFormDataSchema(body: OpenAPIDefinition): OpenAPIDefinition {
    if (!body.properties) {
      return body;
    }

    const formDataProperties: Record<string, any> = {};

    Object.entries(body.properties).forEach(([key, value]: [string, any]) => {
      // Convert File types to binary format
      if (
        value.type === "object" &&
        (key.toLowerCase().includes("file") ||
          value.description?.toLowerCase().includes("file"))
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

  /**
   * Create a default schema for path parameters when no schema is defined
   */
  public createDefaultPathParamsSchema(paramNames: string[]): ParamSchema[] {
    return paramNames.map((paramName) => {
      // Guess the parameter type based on the name
      let type = "string";
      if (
        paramName === "id" ||
        paramName.endsWith("Id") ||
        paramName === "page" ||
        paramName === "limit" ||
        paramName === "size" ||
        paramName === "count"
      ) {
        type = "number";
      }

      const example = this.getExampleForParam(paramName, type);

      return {
        name: paramName,
        in: "path",
        required: true,
        schema: {
          type: type,
        },
        example: example,
        description: `Path parameter: ${paramName}`,
      };
    });
  }

  public createRequestParamsSchema(
    params: OpenAPIDefinition,
    isPathParam: boolean = false
  ): ParamSchema[] {
    const queryParams: ParamSchema[] = [];

    if (params.properties) {
      for (let [name, value] of Object.entries(params.properties)) {
        const param: ParamSchema = {
          in: isPathParam ? "path" : "query",
          name,
          schema: {
            type: value.type,
          },
          required: isPathParam ? true : !!value.required, // Path parameters are always required
        };

        if (value.enum) {
          param.schema.enum = value.enum;
        }

        if (value.description) {
          param.description = value.description;
          param.schema.description = value.description;
        }

        // Add examples for path parameters
        if (isPathParam) {
          const example = this.getExampleForParam(name, value.type);
          param.example = example;
        }

        queryParams.push(param);
      }
    }
    return queryParams;
  }

  public createRequestBodySchema(
    body: OpenAPIDefinition,
    description?: string,
    contentType?: string
  ): any {
    const detectedContentType = this.detectContentType(
      body?.type || "",
      contentType
    );

    let schema = body;

    // If it is multipart/form-data, convert schema
    if (detectedContentType === "multipart/form-data") {
      schema = this.createFormDataSchema(body);
    }

    const requestBody: any = {
      content: {
        [detectedContentType]: {
          schema: schema,
        },
      },
    };

    if (description) {
      requestBody.description = description;
    }

    return requestBody;
  }

  public createResponseSchema(
    responses: OpenAPIDefinition,
    description?: string
  ): any {
    return {
      200: {
        description: description || "Successful response",
        content: {
          "application/json": {
            schema: responses,
          },
        },
      },
    };
  }

  public getSchemaContent({
    tag,
    paramsType,
    pathParamsType,
    bodyType,
    responseType,
  }: any): {
    tag: OpenAPIDefinition;
    params: OpenAPIDefinition;
    pathParams: OpenAPIDefinition;
    body: OpenAPIDefinition;
    responses: OpenAPIDefinition;
  } {
    let params = paramsType ? this.openapiDefinitions[paramsType] : {};
    let pathParams = pathParamsType
      ? this.openapiDefinitions[pathParamsType]
      : {};
    let body = bodyType ? this.openapiDefinitions[bodyType] : {};
    let responses = responseType ? this.openapiDefinitions[responseType] : {};

    if (paramsType && !params) {
      this.findSchemaDefinition(paramsType, "params");
      params = this.openapiDefinitions[paramsType] || {};
    }

    if (pathParamsType && !pathParams) {
      this.findSchemaDefinition(pathParamsType, "pathParams");
      pathParams = this.openapiDefinitions[pathParamsType] || {};
    }

    if (bodyType && !body) {
      this.findSchemaDefinition(bodyType, "body");
      body = this.openapiDefinitions[bodyType] || {};
    }

    if (responseType && !responses) {
      this.findSchemaDefinition(responseType, "response");
      responses = this.openapiDefinitions[responseType] || {};
    }

    if (this.schemaType === "zod") {
      const schemasToProcess = [
        paramsType,
        pathParamsType,
        bodyType,
        responseType,
      ].filter(Boolean);
      schemasToProcess.forEach((schemaName) => {
        if (!this.openapiDefinitions[schemaName]) {
          this.findSchemaDefinition(schemaName, "");
        }
      });
    }

    return {
      tag,
      params,
      pathParams,
      body,
      responses,
    };
  }
}
