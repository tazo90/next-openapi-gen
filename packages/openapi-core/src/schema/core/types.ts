import type { OpenAPIDefinition, SchemaType } from "../../shared/types.js";

export interface SchemaProcessorModule {
  readonly kind: SchemaType | "custom";
  getDefinedSchemas(): Record<string, OpenAPIDefinition>;
  resolveSchema(schemaName: string): OpenAPIDefinition | null;
}
