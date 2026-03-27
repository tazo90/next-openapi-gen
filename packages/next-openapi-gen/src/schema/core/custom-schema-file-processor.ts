import fs from "fs";
import path from "path";

import yaml from "js-yaml";

import { getErrorMessage } from "../../shared/error.js";
import { logger } from "../../shared/logger.js";
import type { OpenAPIDefinition } from "../../shared/types.js";

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

      let parsed: unknown;
      if (ext === ".yaml" || ext === ".yml") {
        parsed = yaml.load(content);
      } else if (ext === ".json") {
        parsed = JSON.parse(content) as unknown;
      } else {
        logger.warn(`Unsupported file type: ${filePath} (use .json, .yaml, or .yml)`);
        continue;
      }

      const schemas = getSchemaRecord(parsed);
      if (schemas) {
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

function getSchemaRecord(parsed: unknown): Record<string, OpenAPIDefinition> | null {
  if (!isRecord(parsed)) {
    return null;
  }

  const components = parsed.components;
  if (isRecord(components) && isSchemaRecord(components.schemas)) {
    return components.schemas;
  }

  if (isSchemaRecord(parsed.schemas)) {
    return parsed.schemas;
  }

  return isSchemaRecord(parsed) ? parsed : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isSchemaRecord(value: unknown): value is Record<string, OpenAPIDefinition> {
  if (!isRecord(value)) {
    return false;
  }

  return Object.values(value).every(
    (item) => typeof item === "object" && item !== null && !Array.isArray(item),
  );
}
