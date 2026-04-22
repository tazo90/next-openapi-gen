import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import * as t from "@babel/types";

import { ZodSchemaConverter } from "@workspace/openapi-core/schema/zod/zod-converter.js";
import type { OpenApiSchema } from "@workspace/openapi-core/shared/types.js";
import { parseTypeScriptFile } from "@workspace/openapi-core/shared/utils.js";

/**
 * Parse a Zod expression source (e.g. `z.string().email()`) and return the
 * first declarator initializer. Useful for testing the converter's AST path
 * without round-tripping through the filesystem.
 */
function parseExpression(source: string): t.Expression {
  const ast = parseTypeScriptFile(`const _schema = ${source};`);
  const statement = ast.program.body[0];
  if (!statement || !t.isVariableDeclaration(statement)) {
    throw new Error("Expected a variable declaration");
  }
  const init = statement.declarations[0]?.init;
  if (!init) throw new Error("Expected an initializer");
  return init;
}

/**
 * Create a converter whose `schemaDir` points at a freshly-created temp
 * directory so `processZodNode` never accidentally scans the workspace.
 * Callers are responsible for removing the directory in `afterEach`.
 */
function createConverter(roots: string[]): ZodSchemaConverter {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-zod-features-"));
  roots.push(root);
  return new ZodSchemaConverter(root);
}

/**
 * Convert a Zod expression source directly to OpenAPI via the AST path.
 */
export function convert(source: string, roots: string[]): OpenApiSchema {
  const converter = createConverter(roots);
  return converter.processZodNode(parseExpression(source));
}

/**
 * Create a converter seeded with a named schema file. Returns the schema
 * pulled out of `converter.zodSchemas` after processing.
 */
export function convertFromFile(
  files: Record<string, string>,
  entry: { file: string; exportName: string },
  roots: string[],
): OpenApiSchema | undefined {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nxog-zod-file-"));
  roots.push(root);

  for (const [rel, contents] of Object.entries(files)) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, contents);
  }

  const converter = new ZodSchemaConverter(root);
  converter.processFileForZodSchema(path.join(root, entry.file), entry.exportName);
  return converter.zodSchemas[entry.exportName];
}

export function cleanup(roots: string[]): void {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
}
