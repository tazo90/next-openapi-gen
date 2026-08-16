export type ArazzoInfo = {
  title: string;
  summary?: string | undefined;
  description?: string | undefined;
  version: string;
  [key: string]: unknown;
};

export type SourceDescriptionObject = {
  name: string;
  type?: "openapi" | "arazzo" | "asyncapi" | (string & {}) | undefined;
  url: string;
  [key: string]: unknown;
};

export type SelectorObject = {
  type?: "jsonpath" | "xpath" | "jsonpointer" | (string & {}) | undefined;
  expression: string;
  [key: string]: unknown;
};

export type CriterionObject = {
  context?: string | undefined;
  condition: string;
  type?: string | SelectorObject | undefined;
  [key: string]: unknown;
};

export type ParameterObject = {
  name: string;
  in?: "path" | "query" | "header" | "cookie" | "body" | "querystring" | (string & {}) | undefined;
  value: unknown;
  [key: string]: unknown;
};

export type StepObject = {
  stepId: string;
  description?: string | undefined;
  operationId?: string | undefined;
  operationPath?: string | undefined;
  workflowId?: string | undefined;
  parameters?: ParameterObject[] | undefined;
  requestBody?: Record<string, unknown> | undefined;
  successCriteria?: CriterionObject[] | undefined;
  outputs?: Record<string, unknown> | undefined;
  onSuccess?: unknown;
  onFailure?: unknown;
  dependsOn?: string[] | undefined;
  timeout?: string | undefined;
  [key: string]: unknown;
};

export type WorkflowObject = {
  workflowId: string;
  summary?: string | undefined;
  description?: string | undefined;
  inputs?: Record<string, unknown> | undefined;
  steps: StepObject[];
  parameters?: ParameterObject[] | undefined;
  successActions?: unknown;
  failureActions?: unknown;
  outputs?: Record<string, unknown> | undefined;
  [key: string]: unknown;
};

export type ArazzoDescription = {
  arazzo: string;
  $self?: string | undefined;
  info: ArazzoInfo;
  sourceDescriptions: SourceDescriptionObject[];
  workflows: WorkflowObject[];
  components?: Record<string, unknown> | undefined;
  [key: string]: unknown;
};
