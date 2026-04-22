import { bench, describe } from "vitest";

import * as t from "@babel/types";

import { ZodRuntimeExporter } from "@workspace/openapi-core/schema/zod/runtime-exporter.js";
import { parseTypeScriptFile } from "@workspace/openapi-core/shared/utils.js";

/**
 * Micro-benchmarks for the runtime-based Zod → JSON Schema exporter.
 * This path executes Zod at runtime and converts via `z.toJSONSchema`,
 * so it's sensitive to both AST interpretation cost and Zod's own runtime.
 */
function parseInitializer(source: string): t.CallExpression {
  const ast = parseTypeScriptFile(`const _schema = ${source};`);
  const declaration = ast.program.body[0] as t.VariableDeclaration;
  const declarator = declaration.declarations[0] as t.VariableDeclarator;
  return declarator.init as t.CallExpression;
}

const objectSource = `z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  age: z.number().int().min(0).max(120),
  active: z.boolean(),
  tags: z.array(z.string()),
  role: z.enum(["admin", "member", "guest"]),
})`;

const unionSource = `z.union([
  z.object({ kind: z.literal("a"), a: z.string() }),
  z.object({ kind: z.literal("b"), b: z.number() }),
])`;

const nestedSource = `z.object({
  user: z.object({
    id: z.string().uuid(),
    email: z.string().email(),
    addresses: z.array(z.object({
      street: z.string(),
      city: z.string(),
      zip: z.string().optional(),
    })),
  }),
  meta: z.record(z.string(), z.unknown()),
})`;

describe("ZodRuntimeExporter micro-benches", () => {
  const objectNode = parseInitializer(objectSource);
  const unionNode = parseInitializer(unionSource);
  const nestedNode = parseInitializer(nestedSource);

  bench("exportSchema — flat z.object (6 fields)", () => {
    const exporter = new ZodRuntimeExporter();
    exporter.exportSchema(objectNode, { contentType: "response" });
  });

  bench("exportSchema — z.union with 2 discriminated variants", () => {
    const exporter = new ZodRuntimeExporter();
    exporter.exportSchema(unionNode, { contentType: "response" });
  });

  bench("exportSchema — nested object with array + record", () => {
    const exporter = new ZodRuntimeExporter();
    exporter.exportSchema(nestedNode, { contentType: "response" });
  });
});
