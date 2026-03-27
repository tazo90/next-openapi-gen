import { UI_TYPES_WITH_NONE } from "./ui-registry.js";
import type { SchemaType } from "../shared/types.js";

export type UiType = (typeof UI_TYPES_WITH_NONE)[number];

export type InitOptions = {
  ui?: UiType;
  docsUrl?: string;
  schema?: SchemaType;
  output?: string;
};
