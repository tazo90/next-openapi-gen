import type { OpenAPIDefinition } from "../../shared/types.js";

export function mergeSchemaDefinitionLayers(
  layers: Array<Record<string, OpenAPIDefinition> | undefined>,
): Record<string, OpenAPIDefinition> {
  const merged: Record<string, OpenAPIDefinition> = {};

  layers.forEach((layer) => {
    if (layer) {
      Object.assign(merged, layer);
    }
  });

  return merged;
}
