import type { Diagnostic, InferredResponseDefinition, OpenAPIDefinition } from "./types.js";

export type InferredRouteResponses = {
  responses: InferredResponseDefinition[];
  diagnostics: Diagnostic[];
};

export type TypeScriptValueReferenceResult = {
  value?: unknown;
  diagnostic?: Diagnostic;
};

export type TypeScriptCompilerAdapter = {
  kind: "classic" | "native";
  packagePath: string;
  version: string;
  invalidate(filePath: string): void;
  clear(): void;
  resolveModule(importPath: string, fromFilePath: string): string | null;
  resolveValueReference(
    referenceName: string,
    fromFilePath: string,
  ): TypeScriptValueReferenceResult;
  inferResponsesForExports(
    filePath: string,
    exportNames: readonly string[],
  ): Map<string, InferredRouteResponses>;
  resolveTypeByName(typeName: string, filePath: string): OpenAPIDefinition | null;
};
