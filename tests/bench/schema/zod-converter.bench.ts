import type * as t from "@babel/types";
import { bench, describe } from "vitest";

import { ZodSchemaConverter } from "@workspace/openapi-core/schema/zod/zod-converter.js";
import { parseTypeScriptFile } from "@workspace/openapi-core/shared/utils.js";

const emptyFileAccess = {
  existsSync: () => false,
  readFileSync: () => "",
  // Unused by processZodNode, but satisfy the ZodConverterFileAccess shape.
  readdirSync: () => [] as string[],
  statSync: () => ({ isDirectory: () => false, isFile: () => false }),
  lstatSync: () => ({ isDirectory: () => false, isFile: () => false, isSymbolicLink: () => false }),
} as unknown as ConstructorParameters<typeof ZodSchemaConverter>[2];

function makeConverter(): ZodSchemaConverter {
  return new ZodSchemaConverter("/virtual", undefined, emptyFileAccess);
}

/**
 * Micro-benchmarks for the Zod AST → OpenAPI pipeline. These intentionally
 * operate in-memory (no filesystem I/O) so they measure the converter's
 * throughput on representative schema shapes, not the fixture loader.
 *
 * To avoid a fragile end-to-end harness, we directly call `processZodNode`
 * on the first variable declarator's initializer. This is what the big
 * generator ends up doing after it has parsed the source file and found
 * a schema export.
 */
function parseInitializer(source: string): t.CallExpression {
  const ast = parseTypeScriptFile(`const _schema = ${source};`);
  const declaration = ast.program.body[0] as t.VariableDeclaration;
  const declarator = declaration.declarations[0];
  return declarator.init as t.CallExpression;
}

const primitiveSource = `z.string().email().min(3).max(255).describe("the user email")`;
const objectSource = `z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  age: z.number().int().min(0),
  tags: z.array(z.string()),
  role: z.enum(["admin", "member", "guest"]),
  address: z.object({ city: z.string(), zip: z.string().optional() }),
})`;
const unionSource = `z.union([
  z.object({ kind: z.literal("a"), a: z.string() }),
  z.object({ kind: z.literal("b"), b: z.number() }),
  z.object({ kind: z.literal("c"), c: z.boolean() }),
])`;
const recordSource = `z.record(z.string(), z.object({ value: z.number() }))`;

describe("zod-converter micro-benches", () => {
  const primitiveNode = parseInitializer(primitiveSource);
  const objectNode = parseInitializer(objectSource);
  const unionNode = parseInitializer(unionSource);
  const recordNode = parseInitializer(recordSource);

  bench("primitive chain (z.string().email()...)", () => {
    makeConverter().processZodNode(primitiveNode);
  });

  bench("z.object with mixed primitives + nested object", () => {
    makeConverter().processZodNode(objectNode);
  });

  bench("z.union over 3 discriminated object variants", () => {
    makeConverter().processZodNode(unionNode);
  });

  bench("z.record(string, object)", () => {
    makeConverter().processZodNode(recordNode);
  });
});
