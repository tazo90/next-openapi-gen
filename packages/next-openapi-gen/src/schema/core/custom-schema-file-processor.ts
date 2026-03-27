import fs from "fs";
import path from "path";

import yaml from "js-yaml";

import { logger } from "../../shared/logger.js";
import type { OpenAPIDefinition } from "../../shared/types.js";

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function processCustomSchemaFiles(schemaFiles: string[]): Record<string, OpenAPIDefinition> {
  const customSchemas: Record<string, OpenAPIDefinition> = {};

  for (const filePath of schemaFiles) {
    try {
      const resolvedPath = path.resolve(filePath);

      if (!fs.existsSync(resolvedPath)) {
        logger.warn(`Schema file not found: ${filePath}`);
        continue;
      }

      const content = fs.readFileSync(resolvedPath, "utf-8");
      const ext = path.extname(filePath).toLowerCase();

      let parsed: any;
      if (ext === ".yaml" || ext === ".yml") {
        parsed = yaml.load(content) as any;
      } else if (ext === ".json") {
        parsed = JSON.parse(content);
      } else {
        logger.warn(`Unsupported file type: ${filePath} (use .json, .yaml, or .yml)`);
        continue;
      }

      const schemas = parsed?.components?.schemas || parsed?.schemas || parsed;
      if (typeof schemas === "object" && schemas !== null) {
        Object.assign(customSchemas, schemas);
        logger.log(`✓ Loaded custom schemas from: ${filePath}`);
      } else {
        logger.warn(
          `No valid schemas found in ${filePath}. Expected OpenAPI format with components.schemas or plain object.`,
        );
      }
    } catch (error) {
      logger.warn(`Failed to load schema file ${filePath}: ${getErrorMessage(error)}`);
    }
  }

  return customSchemas;
}
