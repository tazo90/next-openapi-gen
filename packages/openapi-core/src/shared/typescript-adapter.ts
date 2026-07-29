import type { Diagnostic, InferredResponseDefinition, OpenAPIDefinition } from "./types.js";

export type InferredRouteResponses = {
  responses: InferredResponseDefinition[];
  diagnostics: Diagnostic[];
};

export type TypeScriptValueReferenceResult = {
  value?: unknown;
  diagnostic?: Diagnostic;
};

/**
 * The pieces of a compiler type needed to recognise `Date`. Satisfied structurally
 * by both the classic `ts.Type` and the native adapter's `NativeType`.
 */
type DateTypeLike = {
  getSymbol?: (() => { name?: string | undefined } | undefined) | undefined;
};

/**
 * `Date` is declared as an interface in `lib.es5.d.ts`, so a checker-driven
 * conversion that expands object properties turns it into an object listing every
 * `Date` prototype method rather than a date-time string. Both compiler adapters
 * short-circuit it, and must do so before consulting their recursion guard —
 * otherwise a second `Date` property collapses to a bare `{ type: "object" }`.
 */
export function isDateType<TType extends DateTypeLike>(
  type: TType,
  checker: { typeToString: (type: TType) => string },
): boolean {
  if (type.getSymbol?.()?.name === "Date") {
    return true;
  }

  try {
    return checker.typeToString(type) === "Date";
  } catch {
    return false;
  }
}

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
