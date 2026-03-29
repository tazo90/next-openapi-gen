export type GenerationPerformanceProfile = {
  prepareTemplateMs: number;
  loadCustomFragmentsMs: number;
  prepareDocumentMs: number;
  scanRouteFilesMs: number;
  deriveRoutePathMs: number;
  filterRouteCandidatesMs: number;
  sourcePrecheckMs: number;
  readRouteFilesMs: number;
  parseRouteFilesMs: number;
  analyzeRouteFilesMs: number;
  typescriptResponseInferenceMs: number;
  processRouteFilesMs: number;
  registerRouteMs: number;
  getSchemaContentMs: number;
  createRequestParamsMs: number;
  createRequestBodyMs: number;
  processResponsesMs: number;
  createResponseSchemaMs: number;
  buildOperationsMs: number;
  sortAndMergePathsMs: number;
  buildPathsMs: number;
  defaultComponentsAndErrorsMs: number;
  mergeSchemasMs: number;
  finalizeDocumentMs: number;
  totalMs: number;
};

export function createEmptyGenerationPerformanceProfile(): GenerationPerformanceProfile {
  return {
    prepareTemplateMs: 0,
    loadCustomFragmentsMs: 0,
    prepareDocumentMs: 0,
    scanRouteFilesMs: 0,
    deriveRoutePathMs: 0,
    filterRouteCandidatesMs: 0,
    sourcePrecheckMs: 0,
    readRouteFilesMs: 0,
    parseRouteFilesMs: 0,
    analyzeRouteFilesMs: 0,
    typescriptResponseInferenceMs: 0,
    processRouteFilesMs: 0,
    registerRouteMs: 0,
    getSchemaContentMs: 0,
    createRequestParamsMs: 0,
    createRequestBodyMs: 0,
    processResponsesMs: 0,
    createResponseSchemaMs: 0,
    buildOperationsMs: 0,
    sortAndMergePathsMs: 0,
    buildPathsMs: 0,
    defaultComponentsAndErrorsMs: 0,
    mergeSchemasMs: 0,
    finalizeDocumentMs: 0,
    totalMs: 0,
  };
}

export function measurePerformance<T, K extends keyof GenerationPerformanceProfile>(
  profile: GenerationPerformanceProfile | undefined,
  key: K,
  callback: () => T,
): T {
  const startedAt = performance.now();

  try {
    return callback();
  } finally {
    if (profile) {
      profile[key] += performance.now() - startedAt;
    }
  }
}
