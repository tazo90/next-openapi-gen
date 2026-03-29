import type { OpenAPIDefinition } from "../../shared/types.js";
import type { SchemaProcessorModule } from "./types.js";

export class CustomSchemaProcessor implements SchemaProcessorModule {
  public readonly kind = "custom" as const;

  constructor(private readonly schemas: Record<string, OpenAPIDefinition>) {}

  public getDefinedSchemas(): Record<string, OpenAPIDefinition> {
    return this.schemas;
  }

  public resolveSchema(schemaName: string): OpenAPIDefinition | null {
    return this.schemas[schemaName] || null;
  }
}
