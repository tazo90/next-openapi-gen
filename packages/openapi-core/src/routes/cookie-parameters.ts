import type { GenerationPerformanceProfile } from "../core/performance.js";
import { measurePerformance } from "../core/performance.js";
import type { SchemaProcessor } from "../schema/typescript/schema-processor.js";
import type { DataTypes, OpenApiParameter } from "../shared/types.js";

export function createCookieParameters({
  dataTypes,
  schemaProcessor,
  performanceProfile,
}: {
  dataTypes: DataTypes;
  schemaProcessor: SchemaProcessor;
  performanceProfile?: GenerationPerformanceProfile | undefined;
}): OpenApiParameter[] {
  if (!dataTypes.cookieType) {
    return [];
  }

  const cookieContent = measurePerformance(performanceProfile, "getSchemaContentMs", () =>
    schemaProcessor.getSchemaContent({
      paramsType: dataTypes.cookieType,
    }),
  );

  return measurePerformance(performanceProfile, "createRequestParamsMs", () =>
    schemaProcessor.createRequestParamsSchema(cookieContent.params, false, "cookie"),
  );
}
