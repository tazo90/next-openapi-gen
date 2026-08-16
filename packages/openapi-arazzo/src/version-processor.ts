import type { SpecVersionProcessor } from "@workspace/openapi-core/core/spec-version.js";
import type { DiagnosticsCollector } from "@workspace/openapi-core/diagnostics/collector.js";

import type { ArazzoDescription, ParameterObject, StepObject, WorkflowObject } from "./types.js";

export type ArazzoVersion = "1.0.0" | "1.1.0";

class ArazzoVersionProcessor implements SpecVersionProcessor<ArazzoDescription> {
  constructor(
    public readonly id: ArazzoVersion,
    public readonly version: ArazzoVersion,
  ) {}

  finalize(document: ArazzoDescription): ArazzoDescription {
    const nextDocument = structuredClone(document);
    nextDocument.arazzo = this.version;
    if (this.id !== "1.0.0") {
      return nextDocument;
    }

    delete nextDocument.$self;
    nextDocument.workflows = nextDocument.workflows.map((workflow) => downgradeWorkflow(workflow));
    return nextDocument;
  }
}

const PROCESSORS: Record<ArazzoVersion, ArazzoVersionProcessor> = {
  "1.0.0": new ArazzoVersionProcessor("1.0.0", "1.0.0"),
  "1.1.0": new ArazzoVersionProcessor("1.1.0", "1.1.0"),
};

export function getArazzoVersionProcessor(version = "1.1.0"): ArazzoVersionProcessor {
  if (version.startsWith("1.0")) {
    return PROCESSORS["1.0.0"];
  }
  return PROCESSORS["1.1.0"];
}

export function finalizeArazzoDocument(
  document: ArazzoDescription,
  version: string,
  diagnostics: DiagnosticsCollector,
  filePath?: string,
): ArazzoDescription {
  if (!version.startsWith("1.0")) {
    return getArazzoVersionProcessor(version).finalize(document);
  }

  const nextDocument = getArazzoVersionProcessor("1.0.0").finalize(document);
  if (document.$self) {
    diagnostics.add({
      code: "ARAZZO_SELF_UNSUPPORTED",
      severity: "warning",
      message: "Arazzo 1.0 does not support $self; the field was omitted.",
      filePath,
    });
  }
  return nextDocument;
}

function downgradeWorkflow(workflow: WorkflowObject): WorkflowObject {
  return {
    ...workflow,
    parameters: workflow.parameters?.map(downgradeParameter),
    steps: workflow.steps.map(downgradeStep),
  };
}

function downgradeStep(step: StepObject): StepObject {
  const nextStep = { ...step };
  nextStep.parameters = nextStep.parameters?.map(downgradeParameter);
  nextStep.successCriteria = nextStep.successCriteria?.map((criterion) => {
    if (criterion.type && typeof criterion.type === "object") {
      const { type: _type, ...rest } = criterion;
      return rest;
    }
    return criterion;
  });
  delete nextStep.dependsOn;
  delete nextStep.timeout;
  return nextStep;
}

function downgradeParameter(parameter: ParameterObject): ParameterObject {
  if (parameter.in === "querystring") {
    return { ...parameter, in: "query" };
  }
  return parameter;
}
