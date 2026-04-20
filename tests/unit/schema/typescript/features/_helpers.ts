import * as t from "@babel/types";

import { SchemaProcessor } from "@workspace/openapi-core/schema/typescript/schema-processor.js";
import type { OpenApiSchema } from "@workspace/openapi-core/shared/types.js";
import { parseTypeScriptFile } from "@workspace/openapi-core/shared/utils.js";

/**
 * Parse an inline TypeScript type annotation (e.g. `"a" | "b"`) and return the
 * resulting `TSType` AST node. Input is wrapped in a throwaway variable
 * declaration to give Babel a type-annotation context.
 */
function parseAnnotation(source: string): t.TSType {
  const ast = parseTypeScriptFile(`let _x: ${source};`);
  const declaration = ast.program.body[0] as t.VariableDeclaration;
  const declarator = declaration.declarations[0] as t.VariableDeclarator;
  const idNode = declarator.id as t.Identifier;
  const annotation = idNode.typeAnnotation as t.TSTypeAnnotation;
  return annotation.typeAnnotation;
}

/**
 * Resolve a standalone TypeScript type annotation through `SchemaProcessor`'s
 * `resolveTSNodeType`. Returns the OpenAPI schema the processor would embed.
 *
 * The processor is constructed with a virtual working directory; none of these
 * feature cases exercise filesystem lookups.
 */
export function resolve(source: string): OpenApiSchema {
  const processor = new SchemaProcessor("/virtual", "typescript");
  return (
    processor as unknown as { resolveTSNodeType(n: t.TSType): OpenApiSchema }
  ).resolveTSNodeType(parseAnnotation(source));
}
