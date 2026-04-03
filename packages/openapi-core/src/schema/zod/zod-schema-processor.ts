import { ZodSchemaConverter } from "./zod-converter.js";

import type { ContentType, OpenAPIDefinition } from "../../shared/types.js";
import type { SchemaProcessorModule } from "../core/types.js";

export class ZodSchemaProcessor implements SchemaProcessorModule {
  public readonly kind = "zod" as const;

  constructor(private readonly converter: ZodSchemaConverter) {}

  public getDefinedSchemas(): Record<string, OpenAPIDefinition> {
    return this.converter.getProcessedSchemas();
  }

  public resolveSchema(
    schemaName: string,
    contentType: ContentType = "response",
  ): OpenAPIDefinition | null {
    return this.converter.convertZodSchemaToOpenApi(schemaName, contentType);
  }

  public getConverter(): ZodSchemaConverter {
    return this.converter;
  }
}
