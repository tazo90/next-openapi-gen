import type * as t from "@babel/types";
import { bench, describe } from "vitest";

import { SchemaProcessor } from "@workspace/openapi-core/schema/typescript/schema-processor.js";
import { parseTypeScriptFile } from "@workspace/openapi-core/shared/utils.js";

/**
 * Micro-benchmarks for the TypeScript SchemaProcessor's inline type resolution.
 * These exercise `resolveTSNodeType` directly — the same entry point the TS
 * pipeline hits for each annotated schema, minus filesystem I/O.
 */
function parseTypeAnnotation(source: string): t.TSType {
  const ast = parseTypeScriptFile(`let _x: ${source};`);
  const declaration = ast.program.body[0] as t.VariableDeclaration;
  const declarator = declaration.declarations[0];
  const idNode = declarator.id as t.Identifier;
  const annotation = idNode.typeAnnotation as t.TSTypeAnnotation;
  return annotation.typeAnnotation;
}

const unionLiterals = `"admin" | "member" | "guest"`;
const tupleSource = `[string, number, ...boolean[]]`;
const objectLiteral = `{ id: string; email: string; age?: number; tags: string[]; readonly meta: { createdAt: string } }`;
const templateLiteralEnum = '`${"get" | "post"}_${"users" | "posts"}`';

describe("SchemaProcessor micro-benches", () => {
  const unionNode = parseTypeAnnotation(unionLiterals);
  const tupleNode = parseTypeAnnotation(tupleSource);
  const objectNode = parseTypeAnnotation(objectLiteral);
  const templateNode = parseTypeAnnotation(templateLiteralEnum);

  bench("resolveTSNodeType — string-literal union", () => {
    const processor = new SchemaProcessor("/virtual", "typescript");
    (processor as unknown as { resolveTSNodeType(n: t.TSType): unknown }).resolveTSNodeType(
      unionNode,
    );
  });

  bench("resolveTSNodeType — tuple with rest", () => {
    const processor = new SchemaProcessor("/virtual", "typescript");
    (processor as unknown as { resolveTSNodeType(n: t.TSType): unknown }).resolveTSNodeType(
      tupleNode,
    );
  });

  bench("resolveTSNodeType — object literal (7 members, readonly + nested)", () => {
    const processor = new SchemaProcessor("/virtual", "typescript");
    (processor as unknown as { resolveTSNodeType(n: t.TSType): unknown }).resolveTSNodeType(
      objectNode,
    );
  });

  bench("resolveTSNodeType — template literal enum (4 combos)", () => {
    const processor = new SchemaProcessor("/virtual", "typescript");
    (processor as unknown as { resolveTSNodeType(n: t.TSType): unknown }).resolveTSNodeType(
      templateNode,
    );
  });
});
