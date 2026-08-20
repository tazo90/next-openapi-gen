export type OverlayInfo = {
  title: string;
  version: string;
  description?: string | undefined;
  [key: string]: unknown;
};

export type OverlayTargetFormat = "openapi" | "asyncapi" | "arazzo" | (string & {});

export type OverlayDocumentFormat = "openapi" | "asyncapi" | "arazzo";

export type ActionObject = {
  description?: string | undefined;
  target: string;
  update?: unknown;
  remove?: boolean | undefined;
  copy?: string | undefined;
  [key: string]: unknown;
};

export type ReusableActionObject = {
  description?: string | undefined;
  fields?: Omit<ActionObject, "target"> | undefined;
  [key: string]: unknown;
};

export type ReusableActionReferenceObject = {
  $ref: string;
  target: string;
  description?: string | undefined;
  update?: unknown;
  remove?: boolean | undefined;
  copy?: string | undefined;
  [key: string]: unknown;
};

export type OverlayAction = ActionObject | ReusableActionReferenceObject;

export type OverlayComponents = {
  actions?: Record<string, ReusableActionObject> | undefined;
  [key: string]: unknown;
};

export type OverlayObject = {
  overlay: string;
  $self?: string | undefined;
  info: OverlayInfo;
  extends?: string | undefined;
  targetFormat?: OverlayTargetFormat | undefined;
  actions: OverlayAction[];
  components?: OverlayComponents | undefined;
  [key: string]: unknown;
};
