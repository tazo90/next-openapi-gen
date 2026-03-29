import fs from "fs";
import path from "path";

import yaml from "js-yaml";

import { getErrorMessage } from "../../shared/error.js";
import { logger } from "../../shared/logger.js";
import type { OpenAPIDefinition, OpenApiDocument } from "../../shared/types.js";

export function processCustomSchemaFiles(schemaFiles: string[]): Record<string, OpenAPIDefinition> {
  const customSchemas: Record<string, OpenAPIDefinition> = {};

  for (const filePath of schemaFiles) {
    try {
      const parsed = parseCustomSchemaFile(filePath);
      if (!parsed) {
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

export function loadCustomOpenApiFragments(schemaFiles: string[]): Partial<OpenApiDocument> {
  let mergedFragment: Partial<OpenApiDocument> = {};

  for (const filePath of schemaFiles) {
    try {
      const parsed = parseCustomSchemaFile(filePath);
      if (!parsed) {
        continue;
      }

      const fragment = getOpenApiFragment(parsed);
      mergedFragment = mergeOpenApiFragments(mergedFragment, fragment);
    } catch (error) {
      logger.warn(`Failed to load OpenAPI fragment ${filePath}: ${getErrorMessage(error)}`);
    }
  }

  return mergedFragment;
}

function parseCustomSchemaFile(filePath: string): unknown | null {
  const resolvedPath = path.resolve(filePath);

  if (!fs.existsSync(resolvedPath)) {
    logger.warn(`Schema file not found: ${filePath}`);
    return null;
  }

  const content = fs.readFileSync(resolvedPath, "utf-8");
  const ext = path.extname(filePath).toLowerCase();

  if (ext === ".yaml" || ext === ".yml") {
    return yaml.load(content);
  }

  if (ext === ".json") {
    return JSON.parse(content) as unknown;
  }

  logger.warn(`Unsupported file type: ${filePath} (use .json, .yaml, or .yml)`);
  return null;
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

function getOpenApiFragment(parsed: unknown): Partial<OpenApiDocument> {
  if (!isRecord(parsed)) {
    return {};
  }

  if (isRecord(parsed.components) || isRecord(parsed.paths) || isRecord(parsed.webhooks)) {
    return parsed as Partial<OpenApiDocument>;
  }

  const schemas = getSchemaRecord(parsed);
  if (schemas) {
    return {
      components: {
        schemas,
      },
    };
  }

  return {};
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

function mergeOpenApiFragments(
  base: Partial<OpenApiDocument>,
  fragment: Partial<OpenApiDocument>,
): Partial<OpenApiDocument> {
  const merged = structuredClone(base);

  for (const [key, value] of Object.entries(fragment)) {
    if (typeof value === "undefined") {
      continue;
    }

    const existingValue = merged[key as keyof OpenApiDocument];
    if (Array.isArray(existingValue) && Array.isArray(value)) {
      merged[key as keyof OpenApiDocument] = [...existingValue, ...value] as never;
      continue;
    }

    if (isRecord(existingValue) && isRecord(value)) {
      merged[key as keyof OpenApiDocument] = mergeRecords(existingValue, value) as never;
      continue;
    }

    merged[key as keyof OpenApiDocument] = structuredClone(value) as never;
  }

  return merged;
}

function mergeRecords<T extends Record<string, unknown>>(base: T, fragment: T): T {
  const merged: Record<string, unknown> = structuredClone(base);

  for (const [key, value] of Object.entries(fragment)) {
    const existingValue = merged[key];
    if (Array.isArray(existingValue) && Array.isArray(value)) {
      merged[key] = [...existingValue, ...value];
      continue;
    }

    if (isRecord(existingValue) && isRecord(value)) {
      merged[key] = mergeRecords(existingValue, value);
      continue;
    }

    merged[key] = structuredClone(value);
  }

  return merged as T;
}
