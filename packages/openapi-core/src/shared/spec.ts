import { getPathItemOperations } from "../openapi/path-item.js";
import type {
  JsonValue,
  OpenApiDocument,
  OpenApiExampleMap,
  OpenApiParameter,
  OpenApiReference,
} from "./types.js";

export function applyParameterExamples(
  parameters: Array<OpenApiParameter | OpenApiReference>,
  examples: OpenApiExampleMap | undefined,
  location: "query" | "header" | "cookie",
): void {
  if (!examples) {
    return;
  }

  const paramsByName = new Map(
    parameters.flatMap((parameter) => {
      if (!("in" in parameter) || !("name" in parameter) || parameter.in !== location) {
        return [];
      }
      return [[parameter.name, parameter] as const];
    }),
  );

  for (const [name, example] of Object.entries(examples)) {
    const direct = paramsByName.get(name);
    if (direct) {
      direct.examples = { ...direct.examples, [name]: structuredClone(example) };
      continue;
    }

    if (
      !example ||
      typeof example !== "object" ||
      Array.isArray(example) ||
      !("value" in example)
    ) {
      continue;
    }

    const value = example.value;
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      continue;
    }

    for (const [key, nested] of Object.entries(value)) {
      const parameter = paramsByName.get(key);
      if (!parameter) {
        continue;
      }
      parameter.examples = {
        ...parameter.examples,
        [name]: { ...structuredClone(example), value: nested as JsonValue },
      };
    }
  }
}

export function cleanSpec(spec: OpenApiDocument): OpenApiDocument {
  const newSpec = structuredClone(spec);

  for (const internalKey of INTERNAL_OPENAPI_CONFIG_KEYS) {
    delete newSpec[internalKey];
  }

  // Process paths to ensure good examples for path parameters
  if (newSpec.paths) {
    Object.keys(newSpec.paths).forEach((path) => {
      const pathDefinition = newSpec.paths?.[path];
      if (!pathDefinition) {
        return;
      }

      // Check if path contains parameters
      if (path.includes("{") && path.includes("}")) {
        for (const [, operation] of getPathItemOperations(pathDefinition)) {
          if (!operation.parameters) {
            continue;
          }

          operation.parameters.forEach((param) => {
            if (!isParameterObject(param) || param.in !== "path" || param.example) {
              return;
            }

            if (param.name === "id" || param.name.endsWith("Id")) {
              param.example = 123;
            } else if (param.name === "slug") {
              param.example = "example-slug";
            } else {
              param.example = "example";
            }
          });
        }
      }
    });
  }

  return newSpec;
}

const INTERNAL_OPENAPI_CONFIG_KEYS = [
  "apiDir",
  "routerType",
  "schemaDir",
  "docsUrl",
  "ui",
  "outputFile",
  "outputDir",
  "includeOpenApiRoutes",
  "ignoreRoutes",
  "schemaType",
  "schemaBackends",
  "schemaFiles",
  "defaultResponseSet",
  "responseSets",
  "errorConfig",
  "errorDefinitions",
  "openapiVersion",
  "framework",
  "next",
  "diagnostics",
  "debug",
  "authPresets",
  "excludeSchemas",
  "cache",
  "experimental",
  "arazzo",
  "overlay",
  "generatedDir",
  "watch",
  "clientSdk",
  "docs",
  "hooks",
  "basePath",
] as const;

function isParameterObject(value: OpenApiParameter | { $ref: string }): value is OpenApiParameter {
  return typeof value === "object" && value !== null && "in" in value && "name" in value;
}

export const DEFAULT_AUTH_PRESET_REPLACEMENTS: Record<string, string> = {
  bearer: "BearerAuth",
  basic: "BasicAuth",
  apikey: "ApiKeyAuth",
};

export function performAuthPresetReplacements(
  authValue: string,
  presets: Record<string, string> = DEFAULT_AUTH_PRESET_REPLACEMENTS,
): string {
  return authValue
    .split(",")
    .map((orGroup) =>
      orGroup
        .split(";")
        .map((part) => {
          const token = part.trim();
          return presets[token.toLowerCase()] || token;
        })
        .join(";"),
    )
    .join(",");
}

/**
 * Deep merge source into target. Plain objects are merged recursively,
 * arrays and primitives are replaced.
 */
export function deepMerge<T extends Record<string, unknown>>(
  target: T,
  source: Record<string, unknown>,
): T {
  for (const key of Object.keys(source)) {
    const sourceVal = source[key];
    const targetVal = target[key];
    if (
      sourceVal !== null &&
      typeof sourceVal === "object" &&
      !Array.isArray(sourceVal) &&
      targetVal !== null &&
      typeof targetVal === "object" &&
      !Array.isArray(targetVal)
    ) {
      deepMerge(targetVal as Record<string, unknown>, sourceVal as Record<string, unknown>);
    } else {
      (target as Record<string, unknown>)[key] = sourceVal;
    }
  }
  return target;
}
