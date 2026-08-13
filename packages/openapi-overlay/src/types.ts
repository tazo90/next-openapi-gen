export type OverlayInfo = {
  title: string;
  version: string;
  description?: string | undefined;
  [key: string]: unknown;
};

export type ActionObject = {
  description?: string | undefined;
  target: string;
  update?: unknown;
  remove?: boolean | undefined;
  copy?: string | undefined;
  [key: string]: unknown;
};

export type OverlayObject = {
  overlay: string;
  info: OverlayInfo;
  extends?: string | undefined;
  actions: ActionObject[];
  [key: string]: unknown;
};
