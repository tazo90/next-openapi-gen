import type { OpenApiSchema, SchemaType } from "../../shared/types.js";

export interface SchemaProcessorModule {
  readonly kind: SchemaType | "custom";
  getDefinedSchemas(): Record<string, OpenApiSchema>;
  resolveSchema(schemaName: string): OpenApiSchema | null;
}
