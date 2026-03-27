import { UI_TYPES_WITH_NONE } from "./ui-registry.js";

export type UiType = (typeof UI_TYPES_WITH_NONE)[number];

export type InitOptions = {
  ui?: UiType;
  docsUrl?: string;
  schema?: "zod" | "typescript";
  output?: string;
};
