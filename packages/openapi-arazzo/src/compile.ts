import type { GenerationIR } from "@workspace/openapi-core/core/generation-ir.js";
import type { DiagnosticsCollector } from "@workspace/openapi-core/diagnostics/collector.js";

import type { ArazzoDescription, StepObject, WorkflowObject } from "./types.js";

export function compileArazzoDescription(
  document: ArazzoDescription,
  ir: GenerationIR,
  diagnostics: DiagnosticsCollector,
  filePath?: string,
): ArazzoDescription {
  const nextDocument = structuredClone(document);
  nextDocument.sourceDescriptions = nextDocument.sourceDescriptions.map((source) => {
    if (source.type === "asyncapi") {
      diagnostics.add({
        code: "ARAZZO_ASYNCAPI_SOURCE",
        severity: "info",
        message: `Arazzo source "${source.name}" uses type asyncapi; AsyncAPI documents are not generated.`,
        filePath,
        metadata: { sourceName: source.name },
      });
    }
    return source;
  });

  nextDocument.workflows = nextDocument.workflows.map((workflow) =>
    compileWorkflow(workflow, ir, diagnostics, filePath),
  );
  return nextDocument;
}

function compileWorkflow(
  workflow: WorkflowObject,
  ir: GenerationIR,
  diagnostics: DiagnosticsCollector,
  filePath?: string,
): WorkflowObject {
  return {
    ...workflow,
    steps: workflow.steps.map((step) =>
      compileStep(step, ir, diagnostics, filePath, workflow.workflowId),
    ),
  };
}

function compileStep(
  step: StepObject,
  ir: GenerationIR,
  diagnostics: DiagnosticsCollector,
  filePath: string | undefined,
  workflowId: string,
): StepObject {
  if (step.operationId && !ir.operationsById.has(step.operationId)) {
    diagnostics.add({
      code: "ARAZZO_UNKNOWN_OPERATION_ID",
      severity: "error",
      message: `Arazzo step "${step.stepId}" in workflow "${workflowId}" references unknown operationId "${step.operationId}".`,
      filePath,
      metadata: { workflowId, stepId: step.stepId, operationId: step.operationId },
    });
  }
  return step;
}
